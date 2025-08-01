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
  LayerDefinition,
  LayerGroup,
  LayerStyle,
  LayerOperation,
  LayerError,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerValidationResult,
  LayerPerformanceMetrics,
  LayerType,
  LayerContext
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
  applyStylePreset: (id: string, presetId: string) => Promise<void>

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

  // Performance Monitoring
  recordPerformanceMetrics: (metrics: LayerPerformanceMetrics) => void
  getPerformanceMetrics: (layerId?: string) => LayerPerformanceMetrics[]
  clearPerformanceMetrics: () => void

  // Persistence Operations
  saveToPersistence: () => Promise<void>
  loadFromPersistence: (includeImported?: boolean) => Promise<void>
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
          } catch (error) {
            console.error(`[LayerStore] Failed to sync layer ${layer.id} to new map:`, error)
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

      try {
        await state.mapLibreIntegration.syncLayerToMap(layer)
      } catch (error) {
        console.error(`[LayerStore] Failed to sync layer ${layer.id} to map:`, error)
        throw error
      }
    },

    removeLayerFromMap: async (layerId: string) => {
      const state = get()
      if (!state.mapLibreIntegration) return

      try {
        await state.mapLibreIntegration.removeLayerFromMap(layerId)
      } catch (error) {
        console.error(`[LayerStore] Failed to remove layer ${layerId} from map:`, error)
        throw error
      }
    },

    syncLayerProperties: async (layer: LayerDefinition) => {
      const state = get()
      if (!state.mapLibreIntegration) return

      try {
        await state.mapLibreIntegration.syncLayerProperties(layer)
      } catch (error) {
        console.error(`[LayerStore] Failed to sync properties for layer ${layer.id}:`, error)
        throw error
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
          tags,
          // Add additional context metadata if provided
          ...(context?.metadata || {})
        }
      }

      // Only persist to database if not imported for session-only use
      const shouldPersist = layer.createdBy !== 'import'
      if (shouldPersist) {
        try {
          const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...layerData } = layer
          await window.ctg.layers.create(layerData)
        } catch (error) {
          console.error('[LayerStore] Failed to persist layer to database:', error)
          throw error
        }
      }

      // Update local state
      set((state) => ({
        layers: new Map(state.layers).set(id, layer),
        isDirty: shouldPersist ? false : state.isDirty // Only clean if we persisted
      }))

      // Sync to map immediately after state update
      await get().syncLayerToMap(layer)

      // Record operation
      get().addOperation({
        type: 'create',
        layerId: id,
        timestamp: now
      })

      console.log(`[LayerStore] Added layer: ${layer.name} (${id})`, {
        createdBy: layer.createdBy,
        sessionOnly: !shouldPersist,
        tags: layer.metadata.tags,
        context: context || 'none'
      })
      return id
    },

    updateLayer: async (id, updates) => {
      const existingLayer = get().layers.get(id)
      if (!existingLayer) {
        throw new Error(`Layer not found: ${id}`)
      }

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
      const shouldPersist = existingLayer.createdBy !== 'import'
      if (shouldPersist) {
        try {
          await window.ctg.layers.update(id, updates)
        } catch (error) {
          console.error('[LayerStore] Failed to persist layer update to database:', error)
          throw error
        }
      }

      // Update local state
      set((state) => ({
        layers: new Map(state.layers).set(id, updatedLayer),
        isDirty: shouldPersist ? false : state.isDirty // Only clean if we persisted
      }))

      // Sync updated properties to map
      await get().syncLayerProperties(updatedLayer)

      // Record operation
      get().addOperation({
        type: 'update',
        layerId: id,
        changes: updates,
        timestamp: new Date()
      })

      console.log(`[LayerStore] Updated layer: ${updatedLayer.name} (${id})`)
    },

    removeLayer: async (id) => {
      const layer = get().layers.get(id)
      if (!layer) {
        throw new Error(`Layer not found: ${id}`)
      }

      // Only persist to database if not imported for session-only use
      const shouldPersist = layer.createdBy !== 'import'
      if (shouldPersist) {
        try {
          await window.ctg.layers.delete(id)
        } catch (error) {
          console.error('[LayerStore] Failed to delete layer from database:', error)
          throw error
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

      console.log(`[LayerStore] Removed layer: ${layer.name} (${id})`)
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

      console.log(`[LayerStore] Updated style for layer: ${layer.name} (${id})`)
    },

    setLayerVisibility: async (id, visible) => {
      await get().updateLayer(id, { visibility: visible })
      console.log(`[LayerStore] Set visibility for layer ${id}: ${visible}`)
    },

    setLayerOpacity: async (id, opacity) => {
      if (opacity < 0 || opacity > 1) {
        throw new Error('Opacity must be between 0 and 1')
      }
      await get().updateLayer(id, { opacity })
      console.log(`[LayerStore] Set opacity for layer ${id}: ${opacity}`)
    },

    resetLayerStyle: async (id) => {
      const layer = get().layers.get(id)
      if (!layer) {
        throw new Error(`Layer not found: ${id}`)
      }

      await get().updateLayer(id, { style: { ...DEFAULT_LAYER_STYLE } })
      console.log(`[LayerStore] Reset style for layer: ${layer.name} (${id})`)
    },

    applyStylePreset: async (id, presetId) => {
      // This will be implemented when style presets are added
      console.warn(`[LayerStore] Style presets not yet implemented: ${presetId} for layer ${id}`)
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

      console.log(`[LayerStore] Reordered ${layerIds.length} layers`)
    },

    moveLayerToGroup: async (layerId, groupId) => {
      await get().updateLayer(layerId, { groupId })

      get().addOperation({
        type: 'group',
        layerId,
        timestamp: new Date()
      })

      console.log(`[LayerStore] Moved layer ${layerId} to group ${groupId || 'none'}`)
    },

    setLayerZIndex: async (id, zIndex) => {
      await get().updateLayer(id, { zIndex })
      console.log(`[LayerStore] Set z-index for layer ${id}: ${zIndex}`)
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
      console.log(`[LayerStore] Bulk updated ${updates.length} layers`)
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
      try {
        const {
          id: _id,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          layerIds: _layerIds,
          ...groupData
        } = group
        await window.ctg.layers.groups.create(groupData)
      } catch (error) {
        console.error('[LayerStore] Failed to persist group to database:', error)
        throw error
      }

      // Update local state
      set((state) => ({
        groups: new Map(state.groups).set(id, group),
        isDirty: false // We just persisted, so state is clean
      }))

      console.log(`[LayerStore] Created group: ${name} (${id})`)
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

      console.log(`[LayerStore] Updated group: ${updatedGroup.name} (${id})`)
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

      console.log(`[LayerStore] Deleted group: ${group.name} (${id})`)
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
      console.log(`[LayerStore] Selected layer: ${id}`)
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
      console.log(
        `[LayerStore] Search completed: ${result.layers.length} results in ${result.searchTime.toFixed(2)}ms`
      )
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

    // Performance Monitoring
    recordPerformanceMetrics: (metrics) => {
      // Performance metrics will be stored separately or in a performance store
      console.log(
        `[LayerStore] Performance metrics recorded for layer ${metrics.layerId}:`,
        metrics
      )
    },

    getPerformanceMetrics: (_layerId) => {
      // Placeholder - implement when performance monitoring is added
      return []
    },

    clearPerformanceMetrics: () => {
      console.log('[LayerStore] Performance metrics cleared')
    },

    // Persistence Operations
    saveToPersistence: async () => {
      set({ isLoading: true })
      try {
        console.log('[LayerStore] Saving to persistence...')

        // Save non-imported layers to database (imported layers are session-only)
        const layers = Array.from(get().layers.values()).filter(
          (layer) => layer.createdBy !== 'import'
        )
        const groups = Array.from(get().groups.values())

        // Save each layer individually to maintain referential integrity
        for (const layer of layers) {
          try {
            await window.ctg.layers.update(layer.id, layer)
          } catch (error) {
            // If update fails, try to create the layer
            try {
              const { id, createdAt, updatedAt, ...layerData } = layer
              await window.ctg.layers.create(layerData)
            } catch (createError) {
              console.error(`[LayerStore] Failed to save layer ${layer.id}:`, createError)
              throw createError
            }
          }
        }

        // Save all groups
        for (const group of groups) {
          try {
            await window.ctg.layers.groups.update(group.id, group)
          } catch (error) {
            // If update fails, try to create the group
            try {
              const { id, createdAt, updatedAt, layerIds, ...groupData } = group
              await window.ctg.layers.groups.create(groupData)
            } catch (createError) {
              console.error(`[LayerStore] Failed to save group ${group.id}:`, createError)
              throw createError
            }
          }
        }

        set({ isDirty: false, lastSyncTimestamp: Date.now() })
        console.log(
          `[LayerStore] Successfully saved ${layers.length} layers and ${groups.length} groups`
        )
      } catch (error) {
        console.error('[LayerStore] Failed to save to persistence:', error)
        throw error
      } finally {
        set({ isLoading: false })
      }
    },

    loadFromPersistence: async (includeImported = false) => {
      set({ isLoading: true })
      try {
        console.log('[LayerStore] Loading from persistence...')

        const [layers, groups] = await Promise.all([
          window.ctg.layers.getAll(),
          window.ctg.layers.groups.getAll()
        ])

        // Filter out imported layers unless explicitly requested
        const layersToLoad = includeImported
          ? layers
          : layers.filter((layer) => layer.createdBy !== 'import')

        console.log(
          `[LayerStore] Filtered layers: ${layers.length} total, ${layersToLoad.length} loaded, ${layers.length - layersToLoad.length} filtered out, includeImported: ${includeImported}`
        )

        set({
          layers: new Map(layersToLoad.map((l) => [l.id, l])),
          groups: new Map(groups.map((g) => [g.id, g])),
          isDirty: false,
          lastSyncTimestamp: Date.now()
        })

        console.log(
          `[LayerStore] Loaded ${layersToLoad.length} layers and ${groups.length} groups from persistence`
        )
      } catch (error) {
        console.error('[LayerStore] Failed to load from persistence:', error)
        throw error
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
            const { id: _, createdAt: __, updatedAt: ___, ...layer } = layerData
            const newId = await get().addLayer(layer)
            importedIds.push(newId)
          }
        }

        console.log(`[LayerStore] Imported ${importedIds.length} layers`)
        return importedIds
      } catch (error) {
        console.error('[LayerStore] Failed to import layers:', error)
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
      const sessionLayers = Array.from(state.layers.entries()).filter(
        ([_, layer]) => layer.createdBy === 'import'
      )

      // Remove session-imported layers
      sessionLayers.forEach(([layerId, _]) => {
        state.layers.delete(layerId)
      })

      set({
        layers: new Map(state.layers),
        selectedLayerId:
          state.selectedLayerId && state.layers.has(state.selectedLayerId)
            ? state.selectedLayerId
            : null,
        operations: state.operations.filter(
          (op) => !sessionLayers.some(([layerId, _]) => op.layerId === layerId)
        ),
        errors: state.errors.filter(
          (error) => !sessionLayers.some(([layerId, _]) => error.layerId === layerId)
        )
      })

      console.log(`[LayerStore] Cleared ${sessionLayers.length} session-imported layers`)
    },

    clearSessionLayersForChat: (chatId: string) => {
      const state = get()
      const chatLayers = Array.from(state.layers.entries()).filter(
        ([_, layer]) => layer.createdBy === 'import' && layer.metadata.tags?.includes(chatId)
      )

      // Remove layers associated with this chat
      chatLayers.forEach(([layerId, _]) => {
        state.layers.delete(layerId)
      })

      set({
        layers: new Map(state.layers),
        selectedLayerId:
          state.selectedLayerId && state.layers.has(state.selectedLayerId)
            ? state.selectedLayerId
            : null,
        operations: state.operations.filter(
          (op) => !chatLayers.some(([layerId, _]) => op.layerId === layerId)
        ),
        errors: state.errors.filter(
          (error) => !chatLayers.some(([layerId, _]) => error.layerId === layerId)
        )
      })

      console.log(`[LayerStore] Cleared ${chatLayers.length} layers for chat: ${chatId}`)
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
      console.log('[LayerStore] Store reset')
    },

    cleanup: () => {
      get().reset()
      // Additional cleanup if needed
    }
  }))
)

// Export helper hooks for common operations
export const useSelectedLayer = () => useLayerStore((state) => state.getSelectedLayer())
export const useLayerById = (id: string) => useLayerStore((state) => state.getLayer(id))
export const useVisibleLayers = () =>
  useLayerStore((state) => Array.from(state.layers.values()).filter((l) => l.visibility))
export const useLayerCount = () => useLayerStore((state) => state.layers.size)
export const useLayerErrors = (layerId?: string) =>
  useLayerStore((state) => state.getErrors(layerId))
export const useLayersByGroup = (groupId?: string) =>
  useLayerStore((state) => state.getLayers(groupId))
