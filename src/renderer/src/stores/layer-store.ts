/**
 * Layer Management Store
 *
 * Centralized Zustand store for managing all layer state, styling, and organization.
 * Serves as the single source of truth for layer management.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type {
  LayerCreateInput,
  LayerDefinition,
  LayerGroup,
  LayerStyle,
  LayerOperation,
  LayerError,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerValidationResult,
  LayerType,
  LayerContext,
  LayerSourceConfig,
  LayerMetadata,
  LayerOrigin
} from '../../../shared/types/layer-types'
import { MapLibreIntegration } from '../utils/maplibre-integration'

interface LayerStore {
  // State
  layers: Map<string, LayerDefinition>
  groups: Map<string, LayerGroup>
  selectedLayerId: string | null
  searchResults: LayerSearchResult | null
  operations: LayerOperation[]
  errors: LayerError[]
  isLoading: boolean
  isDirty: boolean
  lastSyncTimestamp: number

  // MapLibre Integration
  mapLibreIntegration: MapLibreIntegration | null

  // Map Management
  setMapInstance: (map: MapLibreMap | null) => Promise<void>
  syncLayerToMap: (layer: LayerDefinition) => Promise<void>
  removeLayerFromMap: (layerId: string) => Promise<void>
  syncLayerProperties: (layer: LayerDefinition) => Promise<void>

  // Layer CRUD Operations
  addLayer: (
    definition: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>,
    context?: LayerContext
  ) => Promise<string>
  updateLayer: (id: string, updates: Partial<LayerDefinition>) => Promise<void>
  removeLayer: (id: string) => Promise<void>
  getLayer: (id: string) => LayerDefinition | undefined
  getLayers: (groupId?: string) => LayerDefinition[]
  getLayersByType: (type: LayerType) => LayerDefinition[]
  layerExists: (id: string) => boolean

  // Layer Styling
  updateLayerStyle: (id: string, style: Partial<LayerStyle>) => Promise<void>
  setLayerVisibility: (id: string, visible: boolean) => Promise<void>
  setLayerOpacity: (id: string, opacity: number) => Promise<void>
  resetLayerStyle: (id: string) => Promise<void>

  // Layer Organization
  reorderLayers: (layerIds: string[]) => Promise<void>
  moveLayerToGroup: (layerId: string, groupId?: string) => Promise<void>
  setLayerZIndex: (id: string, zIndex: number) => Promise<void>
  bulkUpdateLayers: (
    updates: Array<{ id: string; changes: Partial<LayerDefinition> }>
  ) => Promise<void>

  // Group Management
  createGroup: (name: string, parentId?: string) => Promise<string>
  updateGroup: (id: string, updates: Partial<LayerGroup>) => Promise<void>
  deleteGroup: (id: string, moveLayersTo?: string) => Promise<void>
  getGroup: (id: string) => LayerGroup | undefined
  getGroups: (parentId?: string) => LayerGroup[]
  getGroupHierarchy: () => LayerGroup[]

  // Selection Management
  selectLayer: (id: string | null) => void
  getSelectedLayer: () => LayerDefinition | null
  selectNextLayer: () => void
  selectPreviousLayer: () => void

  // Search and Filtering
  searchLayers: (criteria: LayerSearchCriteria) => Promise<LayerSearchResult>
  clearSearch: () => void
  filterLayers: (predicate: (layer: LayerDefinition) => boolean) => LayerDefinition[]

  // Validation
  validateLayer: (layer: Partial<LayerDefinition>) => LayerValidationResult
  validateAllLayers: () => LayerValidationResult[]

  // Persistence Operations
  saveToPersistence: () => Promise<void>
  loadFromPersistence: (includeImported?: boolean) => Promise<void>
  loadChatLayers: (chatId: string) => Promise<void>
  exportLayers: (layerIds: string[]) => Promise<string>
  importLayers: (data: string) => Promise<string[]>

  // State Management
  markClean: () => void
  markDirty: () => void
  getStateSummary: () => {
    totalLayers: number
    totalGroups: number
    visibleLayers: number
    selectedLayer: string | null
    hasErrors: boolean
  }

  // Error Handling
  addError: (error: LayerError) => void
  clearErrors: (layerId?: string) => void
  getErrors: (layerId?: string) => LayerError[]

  // Operation History
  addOperation: (operation: LayerOperation) => void
  getOperations: (layerId?: string) => LayerOperation[]
  clearOperations: () => void

  // Session Management
  clearSessionData: () => void
  clearSessionLayersForChat: (chatId: string) => void

  // Cleanup
  reset: () => void
  cleanup: () => void
}

const omitKeys = <T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> => {
  const next = { ...value } as Omit<T, K> & Record<string, unknown>
  keys.forEach((key) => {
    delete next[key as string]
  })
  return next as Omit<T, K>
}

const buildLayerCreateInput = (layer: LayerDefinition): LayerCreateInput =>
  omitKeys(layer, ['createdAt', 'updatedAt'])

interface SessionLayerCleanupResult {
  removedLayers: LayerDefinition[]
  nextLayers: Map<string, LayerDefinition>
  nextSelectedLayerId: string | null
  nextOperations: LayerOperation[]
  nextErrors: LayerError[]
}

type LayerAssetIdGetter = (layer: LayerDefinition) => string | null

const getRasterAssetId = (layer: LayerDefinition): string | null => {
  const assetId = layer.sourceConfig.options?.rasterAssetId
  return typeof assetId === 'string' && assetId.length > 0 ? assetId : null
}

const getVectorAssetId = (layer: LayerDefinition): string | null => {
  const assetId = layer.sourceConfig.options?.vectorAssetId
  return typeof assetId === 'string' && assetId.length > 0 ? assetId : null
}

const buildSessionLayerCleanupResult = (
  state: Pick<LayerStore, 'layers' | 'selectedLayerId' | 'operations' | 'errors'>,
  predicate: (layer: LayerDefinition) => boolean
): SessionLayerCleanupResult => {
  const removedLayerIds = new Set<string>()
  const removedLayers: LayerDefinition[] = []
  const nextLayers = new Map<string, LayerDefinition>()

  for (const [layerId, layer] of state.layers.entries()) {
    if (predicate(layer)) {
      removedLayerIds.add(layerId)
      removedLayers.push(layer)
      continue
    }

    nextLayers.set(layerId, layer)
  }

  return {
    removedLayers,
    nextLayers,
    nextSelectedLayerId:
      state.selectedLayerId && nextLayers.has(state.selectedLayerId) ? state.selectedLayerId : null,
    nextOperations: state.operations.filter((operation) => !removedLayerIds.has(operation.layerId)),
    nextErrors: state.errors.filter(
      (error) => !error.layerId || !removedLayerIds.has(error.layerId)
    )
  }
}

const collectReleasableAssetIds = (
  removedLayers: LayerDefinition[],
  retainedLayers: Iterable<LayerDefinition>,
  getAssetId: LayerAssetIdGetter
): string[] => {
  const retainedAssetIds = new Set<string>()
  for (const layer of retainedLayers) {
    const assetId = getAssetId(layer)
    if (assetId) {
      retainedAssetIds.add(assetId)
    }
  }

  const releasableAssetIds = new Set<string>()
  for (const layer of removedLayers) {
    const assetId = getAssetId(layer)
    if (assetId && !retainedAssetIds.has(assetId)) {
      releasableAssetIds.add(assetId)
    }
  }

  return Array.from(releasableAssetIds)
}

const hasOtherAssetReference = (
  layers: Iterable<LayerDefinition>,
  excludedLayerId: string,
  assetId: string | null,
  getAssetId: LayerAssetIdGetter
): boolean => {
  if (!assetId) {
    return false
  }

  return Array.from(layers).some(
    (candidate) => candidate.id !== excludedLayerId && getAssetId(candidate) === assetId
  )
}

const isImportedLayerForChat = (layer: LayerDefinition, chatId: string): boolean =>
  layer.createdBy === 'import' &&
  layer.metadata.tags?.includes('session-import') &&
  layer.metadata.tags?.includes(chatId)

const cleanupRemovedSessionLayers = (
  removedLayers: LayerDefinition[],
  retainedLayers: Iterable<LayerDefinition>,
  removeLayerFromMap: (layerId: string) => Promise<void>
): void => {
  if (removedLayers.length === 0) {
    return
  }

  for (const layer of removedLayers) {
    void removeLayerFromMap(layer.id).catch(() => {})

    const sourceData = layer.sourceConfig.data
    if (
      layer.type === 'raster' &&
      typeof sourceData === 'string' &&
      sourceData.startsWith('blob:')
    ) {
      URL.revokeObjectURL(sourceData)
    }
  }

  const ephemeralRemovedLayers = removedLayers.filter((layer) => !isPersistableLayer(layer))

  const releasableAssetIds = collectReleasableAssetIds(
    ephemeralRemovedLayers,
    retainedLayers,
    getRasterAssetId
  )
  for (const assetId of releasableAssetIds) {
    void window.ctg.layers.releaseGeoTiffAsset(assetId).catch(() => {})
  }

  const releasableVectorAssetIds = collectReleasableAssetIds(
    ephemeralRemovedLayers,
    retainedLayers,
    getVectorAssetId
  )
  for (const assetId of releasableVectorAssetIds) {
    void window.ctg.layers.releaseVectorAsset(assetId).catch(() => {})
  }
}

// Default layer style
const DEFAULT_LAYER_STYLE: LayerStyle = {
  // Vector defaults
  pointRadius: 6,
  pointColor: '#3b82f6',
  pointOpacity: 0.8,
  pointStrokeColor: '#ffffff',
  pointStrokeWidth: 2,
  pointStrokeOpacity: 1,

  lineColor: '#3b82f6',
  lineWidth: 2,
  lineOpacity: 0.8,
  lineCap: 'round',
  lineJoin: 'round',

  fillColor: '#3b82f6',
  fillOpacity: 0.3,
  fillOutlineColor: '#1e40af',

  // Raster defaults
  rasterOpacity: 1,
  rasterBrightnessMin: 0,
  rasterBrightnessMax: 1,
  rasterSaturation: 0,
  rasterContrast: 0,
  rasterFadeDuration: 300,

  // Text defaults
  textSize: 12,
  textColor: '#000000',
  textHaloColor: '#ffffff',
  textHaloWidth: 1
}

// Validation helpers
const validateLayerDefinition = (layer: Partial<LayerDefinition>): LayerValidationResult => {
  const errors: LayerError[] = []
  const warnings: string[] = []

  // Required field validation
  if (!layer.name?.trim()) {
    errors.push({
      code: 'INVALID_LAYER_DATA',
      message: 'Layer name is required',
      timestamp: new Date()
    })
  }

  if (!layer.type) {
    errors.push({
      code: 'INVALID_LAYER_DATA',
      message: 'Layer type is required',
      timestamp: new Date()
    })
  }

  if (!layer.sourceId?.trim()) {
    errors.push({
      code: 'INVALID_LAYER_DATA',
      message: 'Source ID is required',
      timestamp: new Date()
    })
  }

  // Opacity validation
  if (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) {
    errors.push({
      code: 'INVALID_LAYER_DATA',
      message: 'Opacity must be between 0 and 1',
      timestamp: new Date()
    })
  }

  // Name length validation
  if (layer.name && layer.name.length > 100) {
    warnings.push('Layer name is very long and may be truncated in UI')
  }

  // Style validation
  if (layer.style) {
    const style = layer.style
    if (style.pointRadius !== undefined && (style.pointRadius < 0 || style.pointRadius > 100)) {
      warnings.push('Point radius should be between 0 and 100')
    }
    if (style.lineWidth !== undefined && (style.lineWidth < 0 || style.lineWidth > 50)) {
      warnings.push('Line width should be between 0 and 50')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

// Search implementation
const searchLayersImpl = (
  layers: Map<string, LayerDefinition>,
  criteria: LayerSearchCriteria
): LayerSearchResult => {
  const startTime = performance.now()
  let filteredLayers = Array.from(layers.values())

  // Text search
  if (criteria.query?.trim()) {
    const query = criteria.query.toLowerCase().trim()
    filteredLayers = filteredLayers.filter(
      (layer) =>
        layer.name.toLowerCase().includes(query) ||
        layer.metadata.description?.toLowerCase().includes(query) ||
        layer.metadata.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  }

  // Type filter
  if (criteria.type) {
    filteredLayers = filteredLayers.filter((layer) => layer.type === criteria.type)
  }

  // Tags filter
  if (criteria.tags?.length) {
    filteredLayers = filteredLayers.filter((layer) =>
      criteria.tags!.some((tag) => layer.metadata.tags.includes(tag))
    )
  }

  // Origin filter
  if (criteria.createdBy) {
    filteredLayers = filteredLayers.filter((layer) => layer.createdBy === criteria.createdBy)
  }

  // Date range filter
  if (criteria.dateRange) {
    filteredLayers = filteredLayers.filter(
      (layer) =>
        layer.createdAt >= criteria.dateRange!.start && layer.createdAt <= criteria.dateRange!.end
    )
  }

  // Bounds filter
  if (criteria.bounds && criteria.bounds.length === 4) {
    filteredLayers = filteredLayers.filter((layer) => {
      const layerBounds = layer.metadata.bounds
      if (!layerBounds) return false

      const [queryMinLng, queryMinLat, queryMaxLng, queryMaxLat] = criteria.bounds!
      const [layerMinLng, layerMinLat, layerMaxLng, layerMaxLat] = layerBounds

      return !(
        layerMaxLng < queryMinLng ||
        layerMinLng > queryMaxLng ||
        layerMaxLat < queryMinLat ||
        layerMinLat > queryMaxLat
      )
    })
  }

  // Group filter
  if (criteria.groupId) {
    filteredLayers = filteredLayers.filter((layer) => layer.groupId === criteria.groupId)
  }

  // Geometry filter
  if (criteria.hasGeometry !== undefined) {
    filteredLayers = filteredLayers.filter((layer) => {
      const hasGeom = layer.metadata.geometryType !== undefined
      return criteria.hasGeometry ? hasGeom : !hasGeom
    })
  }

  const searchTime = performance.now() - startTime

  return {
    layers: filteredLayers,
    totalCount: filteredLayers.length,
    hasMore: false, // In-memory search returns all results
    searchTime
  }
}

// Persist layers whose source can be reloaded from a stable reference or managed asset URL.
const isPersistableLayer = (layer: LayerDefinition): boolean => {
  if (typeof layer.sourceConfig?.data !== 'string') {
    return false
  }

  const sourceData = layer.sourceConfig.data.trim().toLowerCase()
  if (sourceData.startsWith('blob:') || sourceData.startsWith('data:')) {
    return false
  }

  return sourceData.length > 0
}

// Create the store
export const useLayerStore = create<LayerStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    layers: new Map(),
    groups: new Map(),
    selectedLayerId: null,
    searchResults: null,
    operations: [],
    errors: [],
    isLoading: false,
    isDirty: false,
    lastSyncTimestamp: 0,

    // MapLibre Integration
    mapLibreIntegration: null,

    // Map Management
    setMapInstance: async (map: MapLibreMap | null) => {
      const integration = map ? new MapLibreIntegration(map) : null
      set({ mapLibreIntegration: integration })

      // Sync all existing visible layers to the new map instance
      if (integration) {
        const layers = Array.from(get().layers.values())
        const visibleLayers = layers.filter((layer) => layer.visibility)

        for (const layer of visibleLayers) {
          try {
            await integration.syncLayerToMap(layer)
          } catch {
            void 0
          }
        }
      }
    },

    // MapLibre Helper Methods
    syncLayerToMap: async (layer: LayerDefinition) => {
      const state = get()
      if (!state.mapLibreIntegration) {
        return
      }

      {
        await state.mapLibreIntegration.syncLayerToMap(layer)
      }
    },

    removeLayerFromMap: async (layerId: string) => {
      const state = get()
      if (!state.mapLibreIntegration) return

      {
        await state.mapLibreIntegration.removeLayerFromMap(layerId)
      }
    },

    syncLayerProperties: async (layer: LayerDefinition) => {
      const state = get()
      if (!state.mapLibreIntegration) return

      {
        await state.mapLibreIntegration.syncLayerProperties(layer)
      }
    },

    // Layer CRUD Operations
    addLayer: async (definition, context) => {
      const id = uuidv4()
      const now = new Date()

      // Validate the layer definition
      const validation = validateLayerDefinition(definition)
      if (!validation.valid) {
        validation.errors.forEach((error) => get().addError({ ...error, layerId: id }))
        throw new Error(
          `Invalid layer definition: ${validation.errors.map((e) => e.message).join(', ')}`
        )
      }

      // Prepare metadata with context-based tagging
      const metadata = { ...definition.metadata }
      let tags = [...(metadata.tags || [])]
      const mergedContextMetadata =
        context?.metadata && Object.keys(context.metadata).length > 0
          ? {
              ...(metadata.context || {}),
              ...context.metadata
            }
          : metadata.context

      // Add context-based tags for imported layers
      if (definition.createdBy === 'import' && context?.chatId) {
        tags = [...tags, 'session-import', context.chatId]
      }

      // Add source context if provided
      if (context?.source) {
        tags = [...tags, `source:${context.source}`]
      }

      const layer: LayerDefinition = {
        ...definition,
        id,
        createdAt: now,
        updatedAt: now,
        style: { ...DEFAULT_LAYER_STYLE, ...definition.style },
        metadata: {
          ...metadata,
          tags: Array.from(new Set(tags)),
          ...(mergedContextMetadata ? { context: mergedContextMetadata } : {})
        }
      }

      // Only persist to database if not imported for session-only use
      const shouldPersist = isPersistableLayer(layer)
      let effectiveLayer = layer
      if (shouldPersist) {
        {
          effectiveLayer =
            (await window.ctg.layers.create(buildLayerCreateInput(layer))) ?? effectiveLayer
        }
      }

      // Update local state
      set((state) => ({
        layers: new Map(state.layers).set(effectiveLayer.id, effectiveLayer),
        isDirty: shouldPersist ? false : state.isDirty // Only clean if we persisted
      }))

      // Sync to map immediately after state update
      try {
        await get().syncLayerToMap(effectiveLayer)
      } catch (error) {
        get().addError({
          code: 'SOURCE_LOAD_FAILED',
          message: `Failed to sync layer "${effectiveLayer.name}" to map`,
          details: {
            layerId: effectiveLayer.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          timestamp: new Date(),
          layerId: effectiveLayer.id
        })
      }

      // Auto-zoom to layer if bounds are available
      const map = get().mapLibreIntegration?.getMapInstance()
      const bounds = effectiveLayer.metadata.bounds
      if (
        map &&
        bounds &&
        bounds.length === 4 &&
        bounds.every((b) => typeof b === 'number' && isFinite(b)) &&
        (bounds[0] !== bounds[2] || bounds[1] !== bounds[3])
      ) {
        try {
          map.fitBounds(bounds as [number, number, number, number], { padding: 40, maxZoom: 16 })
        } catch {
          // Ignore fit errors; rendering is handled separately
        }
      }

      // Record operation
      get().addOperation({
        type: 'create',
        layerId: effectiveLayer.id,
        timestamp: now
      })

      return effectiveLayer.id
    },

    updateLayer: async (id, updates) => {
      const existingLayer = get().layers.get(id)
      if (!existingLayer) {
        throw new Error(`Layer not found: ${id}`)
      }

      const sourceConfigChanged =
        updates.sourceConfig !== undefined &&
        JSON.stringify(updates.sourceConfig) !== JSON.stringify(existingLayer.sourceConfig)
      const sourceIdChanged =
        typeof updates.sourceId === 'string' && updates.sourceId !== existingLayer.sourceId

      const updatedLayer: LayerDefinition = {
        ...existingLayer,
        ...updates,
        id, // Prevent ID changes
        updatedAt: new Date()
      }

      // Validate updated layer
      const validation = validateLayerDefinition(updatedLayer)
      if (!validation.valid) {
        validation.errors.forEach((error) => get().addError({ ...error, layerId: id }))
        throw new Error(
          `Invalid layer update: ${validation.errors.map((e) => e.message).join(', ')}`
        )
      }

      // Only persist to database if not imported for session-only use
      const shouldPersist = isPersistableLayer(updatedLayer)
      let persistedLayer = updatedLayer
      if (shouldPersist) {
        persistedLayer = (await window.ctg.layers.update(id, updates)) ?? persistedLayer
      }

      // Update local state
      set((state) => ({
        layers: new Map(state.layers).set(id, persistedLayer),
        isDirty: shouldPersist ? false : state.isDirty // Only clean if we persisted
      }))

      // Source changes require a source rebuild so MapLibre picks up the new tile URL/options.
      if (sourceConfigChanged || sourceIdChanged) {
        await get().removeLayerFromMap(id)
        await get().syncLayerToMap(persistedLayer)
      } else {
        await get().syncLayerProperties(persistedLayer)
      }

      // Record operation
      get().addOperation({
        type: 'update',
        layerId: id,
        changes: updates,
        timestamp: new Date()
      })
    },

    removeLayer: async (id) => {
      const layer = get().layers.get(id)
      if (!layer) {
        throw new Error(`Layer not found: ${id}`)
      }

      // Only persist to database if not imported for session-only use
      const shouldPersist = isPersistableLayer(layer)
      if (shouldPersist) {
        const deleted = await window.ctg.layers.delete(id)
        if (!deleted) {
          throw new Error(`Failed to delete persisted layer: ${id}`)
        }
      } else {
        const rasterAssetId = getRasterAssetId(layer)
        if (
          rasterAssetId &&
          !hasOtherAssetReference(get().layers.values(), id, rasterAssetId, getRasterAssetId)
        ) {
          await window.ctg.layers.releaseGeoTiffAsset(rasterAssetId)
        }

        const vectorAssetId = getVectorAssetId(layer)
        if (
          vectorAssetId &&
          !hasOtherAssetReference(get().layers.values(), id, vectorAssetId, getVectorAssetId)
        ) {
          await window.ctg.layers.releaseVectorAsset(vectorAssetId)
        }
      }

      // Remove from map first
      await get().removeLayerFromMap(id)

      // Update local state
      set((state) => {
        const newLayers = new Map(state.layers)
        newLayers.delete(id)

        return {
          layers: newLayers,
          selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
          isDirty: shouldPersist ? false : state.isDirty // Only clean if we persisted
        }
      })

      // Record operation
      get().addOperation({
        type: 'delete',
        layerId: id,
        timestamp: new Date()
      })
    },

    getLayer: (id) => {
      return get().layers.get(id)
    },

    getLayers: (groupId) => {
      const layers = Array.from(get().layers.values())
      if (groupId === undefined) {
        return layers.sort((a, b) => b.zIndex - a.zIndex)
      }
      return layers.filter((layer) => layer.groupId === groupId).sort((a, b) => b.zIndex - a.zIndex)
    },

    getLayersByType: (type) => {
      return Array.from(get().layers.values())
        .filter((layer) => layer.type === type)
        .sort((a, b) => b.zIndex - a.zIndex)
    },

    layerExists: (id) => {
      return get().layers.has(id)
    },

    // Layer Styling
    updateLayerStyle: async (id, style) => {
      const layer = get().layers.get(id)
      if (!layer) {
        throw new Error(`Layer not found: ${id}`)
      }

      const updatedStyle = { ...layer.style, ...style }
      await get().updateLayer(id, { style: updatedStyle })
    },

    setLayerVisibility: async (id, visible) => {
      await get().updateLayer(id, { visibility: visible })
    },

    setLayerOpacity: async (id, opacity) => {
      if (opacity < 0 || opacity > 1) {
        throw new Error('Opacity must be between 0 and 1')
      }
      await get().updateLayer(id, { opacity })
    },

    resetLayerStyle: async (id) => {
      const layer = get().layers.get(id)
      if (!layer) {
        throw new Error(`Layer not found: ${id}`)
      }

      await get().updateLayer(id, { style: { ...DEFAULT_LAYER_STYLE } })
    },

    // Layer Organization
    reorderLayers: async (layerIds) => {
      const layers = get().layers
      const updates: Array<{ id: string; changes: Partial<LayerDefinition> }> = []

      layerIds.forEach((layerId, index) => {
        const layer = layers.get(layerId)
        if (layer) {
          updates.push({
            id: layerId,
            changes: { zIndex: layerIds.length - index }
          })
        }
      })

      await get().bulkUpdateLayers(updates)

      get().addOperation({
        type: 'reorder',
        layerId: layerIds[0] || 'unknown', // Reference first layer
        timestamp: new Date()
      })
    },

    moveLayerToGroup: async (layerId, groupId) => {
      await get().updateLayer(layerId, { groupId })

      get().addOperation({
        type: 'group',
        layerId,
        timestamp: new Date()
      })
    },

    setLayerZIndex: async (id, zIndex) => {
      await get().updateLayer(id, { zIndex })
    },

    bulkUpdateLayers: async (updates) => {
      const state = get()
      const newLayers = new Map(state.layers)

      for (const { id, changes } of updates) {
        const existingLayer = newLayers.get(id)
        if (existingLayer) {
          newLayers.set(id, {
            ...existingLayer,
            ...changes,
            updatedAt: new Date()
          })
        }
      }

      set({ layers: newLayers, isDirty: true })
    },

    // Group Management
    createGroup: async (name, parentId) => {
      const id = uuidv4()
      const now = new Date()

      const group: LayerGroup = {
        id,
        name,
        parentId,
        displayOrder: 0,
        expanded: true,
        layerIds: [],
        createdAt: now,
        updatedAt: now
      }

      // Persist to database first
      {
        const groupData = omitKeys(group, ['id', 'createdAt', 'updatedAt', 'layerIds'])
        await window.ctg.layers.groups.create(groupData)
      }

      // Update local state
      set((state) => ({
        groups: new Map(state.groups).set(id, group),
        isDirty: false // We just persisted, so state is clean
      }))

      return id
    },

    updateGroup: async (id, updates) => {
      const existingGroup = get().groups.get(id)
      if (!existingGroup) {
        throw new Error(`Group not found: ${id}`)
      }

      const updatedGroup: LayerGroup = {
        ...existingGroup,
        ...updates,
        id, // Prevent ID changes
        updatedAt: new Date()
      }

      set((state) => ({
        groups: new Map(state.groups).set(id, updatedGroup),
        isDirty: true
      }))
    },

    deleteGroup: async (id, moveLayersTo) => {
      const group = get().groups.get(id)
      if (!group) {
        throw new Error(`Group not found: ${id}`)
      }

      // Move layers to another group or remove group assignment
      const layersInGroup = get().getLayers(id)
      for (const layer of layersInGroup) {
        await get().moveLayerToGroup(layer.id, moveLayersTo)
      }

      set((state) => {
        const newGroups = new Map(state.groups)
        newGroups.delete(id)
        return { groups: newGroups, isDirty: true }
      })
    },

    getGroup: (id) => {
      return get().groups.get(id)
    },

    getGroups: (parentId) => {
      return Array.from(get().groups.values())
        .filter((group) => group.parentId === parentId)
        .sort((a, b) => a.displayOrder - b.displayOrder)
    },

    getGroupHierarchy: () => {
      const allGroups = Array.from(get().groups.values())
      const rootGroups = allGroups.filter((g) => !g.parentId)

      const buildHierarchy = (groups: LayerGroup[]): LayerGroup[] => {
        return groups
          .map((group) => ({
            ...group
            // Add children if needed in the future
          }))
          .sort((a, b) => a.displayOrder - b.displayOrder)
      }

      return buildHierarchy(rootGroups)
    },

    // Selection Management
    selectLayer: (id) => {
      set({ selectedLayerId: id })
    },

    getSelectedLayer: () => {
      const selectedId = get().selectedLayerId
      return selectedId ? get().layers.get(selectedId) || null : null
    },

    selectNextLayer: () => {
      const layers = get().getLayers()
      const currentId = get().selectedLayerId

      if (layers.length === 0) return

      if (!currentId) {
        get().selectLayer(layers[0].id)
        return
      }

      const currentIndex = layers.findIndex((l) => l.id === currentId)
      const nextIndex = (currentIndex + 1) % layers.length
      get().selectLayer(layers[nextIndex].id)
    },

    selectPreviousLayer: () => {
      const layers = get().getLayers()
      const currentId = get().selectedLayerId

      if (layers.length === 0) return

      if (!currentId) {
        get().selectLayer(layers[layers.length - 1].id)
        return
      }

      const currentIndex = layers.findIndex((l) => l.id === currentId)
      const prevIndex = currentIndex === 0 ? layers.length - 1 : currentIndex - 1
      get().selectLayer(layers[prevIndex].id)
    },

    // Search and Filtering
    searchLayers: async (criteria) => {
      const result = searchLayersImpl(get().layers, criteria)
      set({ searchResults: result })
      return result
    },

    clearSearch: () => {
      set({ searchResults: null })
    },

    filterLayers: (predicate) => {
      return Array.from(get().layers.values()).filter(predicate)
    },

    // Validation
    validateLayer: (layer) => {
      return validateLayerDefinition(layer)
    },

    validateAllLayers: () => {
      return Array.from(get().layers.values()).map((_layer) => {
        return validateLayerDefinition(_layer)
      })
    },

    // Persistence Operations
    saveToPersistence: async () => {
      set({ isLoading: true })
      try {
        // Save non-imported layers to database (imported layers are session-only)
        const layers = Array.from(get().layers.values()).filter((layer) =>
          isPersistableLayer(layer)
        )
        const groups = Array.from(get().groups.values())

        // Save each layer individually to maintain referential integrity
        for (const layer of layers) {
          try {
            await window.ctg.layers.update(layer.id, layer)
          } catch {
            // If update fails, try to create the layer
            {
              await window.ctg.layers.create(buildLayerCreateInput(layer))
            }
          }
        }

        // Save all groups
        for (const group of groups) {
          try {
            await window.ctg.layers.groups.update(group.id, group)
          } catch {
            // If update fails, try to create the group
            {
              const groupData = omitKeys(group, ['id', 'createdAt', 'updatedAt', 'layerIds'])
              await window.ctg.layers.groups.create(groupData)
            }
          }
        }

        set({ isDirty: false, lastSyncTimestamp: Date.now() })
      } finally {
        set({ isLoading: false })
      }
    },

    loadFromPersistence: async (includeImported = false) => {
      set({ isLoading: true })
      try {
        const [layers, groups] = await Promise.all([
          window.ctg.layers.getAll(),
          window.ctg.layers.groups.getAll()
        ])

        // Keep existing in-memory imported layers (e.g., session imports) so we don't blow them away
        const currentImportedLayers = Array.from(get().layers.values()).filter(
          (layer) => layer.createdBy === 'import'
        )

        // Filter out imported layers from persistence unless explicitly requested
        const layersFromPersistence = includeImported
          ? layers
          : layers.filter((layer) => layer.createdBy !== 'import')

        // Merge: persistence layers first, then current imported (preserve runtime/session layers)
        const mergedLayers = [
          ...layersFromPersistence,
          ...currentImportedLayers.filter(
            (runtimeLayer) => !layersFromPersistence.some((l) => l.id === runtimeLayer.id)
          )
        ]

        set({
          layers: new Map(mergedLayers.map((l) => [l.id, l])),
          groups: new Map(groups.map((g) => [g.id, g])),
          selectedLayerId:
            get().selectedLayerId &&
            mergedLayers.some((layer) => layer.id === get().selectedLayerId)
              ? get().selectedLayerId
              : null,
          isDirty: false,
          lastSyncTimestamp: Date.now()
        })
      } finally {
        set({ isLoading: false })
      }
    },

    loadChatLayers: async (chatId: string) => {
      set({ isLoading: true })
      try {
        const [layers, groups] = await Promise.all([
          window.ctg.layers.getAll(),
          window.ctg.layers.groups.getAll()
        ])

        const visibleLayers = layers.filter(
          (layer) => layer.createdBy !== 'import' || isImportedLayerForChat(layer, chatId)
        )

        set({
          layers: new Map(visibleLayers.map((layer) => [layer.id, layer])),
          groups: new Map(groups.map((group) => [group.id, group])),
          selectedLayerId:
            get().selectedLayerId &&
            visibleLayers.some((layer) => layer.id === get().selectedLayerId)
              ? get().selectedLayerId
              : null,
          isDirty: false,
          lastSyncTimestamp: Date.now()
        })
      } finally {
        set({ isLoading: false })
      }
    },

    exportLayers: async (layerIds) => {
      const layers = layerIds.map((id) => get().layers.get(id)).filter(Boolean) as LayerDefinition[]
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        layers
      }
      return JSON.stringify(exportData, null, 2)
    },

    importLayers: async (data) => {
      try {
        const importData = JSON.parse(data)
        const importedIds: string[] = []

        if (importData.layers && Array.isArray(importData.layers)) {
          for (const layerData of importData.layers) {
            const layer = { ...layerData }
            delete layer.id
            delete layer.createdAt
            delete layer.updatedAt
            const newId = await get().addLayer(layer)
            importedIds.push(newId)
          }
        }

        return importedIds
      } catch {
        throw new Error('Invalid import data format')
      }
    },

    // State Management
    markClean: () => {
      set({ isDirty: false })
    },

    markDirty: () => {
      set({ isDirty: true })
    },

    getStateSummary: () => {
      const state = get()
      return {
        totalLayers: state.layers.size,
        totalGroups: state.groups.size,
        visibleLayers: Array.from(state.layers.values()).filter((l) => l.visibility).length,
        selectedLayer: state.selectedLayerId,
        hasErrors: state.errors.length > 0
      }
    },

    // Error Handling
    addError: (error) => {
      set((state) => ({
        errors: [...state.errors, { ...error, timestamp: new Date() }].slice(-100) // Keep last 100 errors
      }))
    },

    clearErrors: (layerId) => {
      set((state) => ({
        errors: layerId ? state.errors.filter((e) => e.layerId !== layerId) : []
      }))
    },

    getErrors: (layerId) => {
      const errors = get().errors
      return layerId ? errors.filter((e) => e.layerId === layerId) : errors
    },

    // Operation History
    addOperation: (operation) => {
      set((state) => ({
        operations: [...state.operations, operation].slice(-1000) // Keep last 1000 operations
      }))
    },

    getOperations: (layerId) => {
      const operations = get().operations
      return layerId ? operations.filter((op) => op.layerId === layerId) : operations
    },

    clearOperations: () => {
      set({ operations: [] })
    },

    // Session Management
    clearSessionData: () => {
      const state = get()
      const cleanupResult = buildSessionLayerCleanupResult(
        state,
        (layer) => layer.createdBy === 'import'
      )

      set({
        layers: cleanupResult.nextLayers,
        selectedLayerId: cleanupResult.nextSelectedLayerId,
        operations: cleanupResult.nextOperations,
        errors: cleanupResult.nextErrors
      })

      cleanupRemovedSessionLayers(
        cleanupResult.removedLayers,
        cleanupResult.nextLayers.values(),
        get().removeLayerFromMap
      )
    },

    clearSessionLayersForChat: (chatId: string) => {
      const state = get()
      const cleanupResult = buildSessionLayerCleanupResult(
        state,
        (layer) => layer.createdBy === 'import' && layer.metadata.tags?.includes(chatId)
      )

      set({
        layers: cleanupResult.nextLayers,
        selectedLayerId: cleanupResult.nextSelectedLayerId,
        operations: cleanupResult.nextOperations,
        errors: cleanupResult.nextErrors
      })

      cleanupRemovedSessionLayers(
        cleanupResult.removedLayers,
        cleanupResult.nextLayers.values(),
        get().removeLayerFromMap
      )
    },

    // Cleanup
    reset: () => {
      const state = get()

      // Clear all managed layers and sources from map
      if (state.mapLibreIntegration) {
        state.mapLibreIntegration.cleanup()
      }

      set({
        layers: new Map(),
        groups: new Map(),
        selectedLayerId: null,
        searchResults: null,
        operations: [],
        errors: [],
        isLoading: false,
        isDirty: false,
        lastSyncTimestamp: 0,
        mapLibreIntegration: null
      })
    },

    cleanup: () => {
      get().reset()
      // Additional cleanup if needed
    }
  }))
)

// Push the in-memory layer store snapshot to the main process (for LLM tools).
if (typeof window !== 'undefined' && window.ctg?.layers?.updateRuntimeSnapshot) {
  const serializeLayerForRuntime = (
    layer: LayerDefinition
  ): {
    createdAt: string
    updatedAt: string
    id: string
    name: string
    type: LayerType
    sourceId: string
    sourceConfig: LayerSourceConfig
    style: LayerStyle
    visibility: boolean
    opacity: number
    zIndex: number
    metadata: LayerMetadata
    groupId?: string
    isLocked: boolean
    createdBy: LayerOrigin
  } => ({
    ...layer,
    createdAt: layer.createdAt instanceof Date ? layer.createdAt.toISOString() : layer.createdAt,
    updatedAt: layer.updatedAt instanceof Date ? layer.updatedAt.toISOString() : layer.updatedAt
  })

  let debounceHandle: ReturnType<typeof setTimeout> | null = null
  const pushRuntimeSnapshot = (): void => {
    const layers = Array.from(useLayerStore.getState().layers.values()).map((l) =>
      serializeLayerForRuntime(l)
    )
    window.ctg.layers.updateRuntimeSnapshot(layers).catch(() => {})
  }

  const schedulePush = (): void => {
    if (debounceHandle) {
      clearTimeout(debounceHandle)
    }
    debounceHandle = setTimeout(pushRuntimeSnapshot, 150)
  }

  // Initial push and subscription for subsequent updates
  schedulePush()
  useLayerStore.subscribe(
    (state) => state.layers,
    () => schedulePush(),
    {
      equalityFn: (a: Map<string, LayerDefinition>, b: Map<string, LayerDefinition>) => a === b
    }
  )
}

// Export helper hooks for common operations
export const useSelectedLayer = (): LayerDefinition | null =>
  useLayerStore((state) => state.getSelectedLayer())
export const useLayerById = (id: string): LayerDefinition | undefined =>
  useLayerStore((state) => state.getLayer(id))
export const useVisibleLayers = (): LayerDefinition[] =>
  useLayerStore((state) => Array.from(state.layers.values()).filter((l) => l.visibility))
export const useLayerCount = (): number => useLayerStore((state) => state.layers.size)
export const useLayerErrors = (layerId?: string): LayerError[] =>
  useLayerStore((state) => state.getErrors(layerId))
export const useLayersByGroup = (groupId?: string): LayerDefinition[] =>
  useLayerStore((state) => state.getLayers(groupId))
