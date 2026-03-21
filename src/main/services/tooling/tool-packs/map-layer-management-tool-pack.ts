import {
  listMapLayersToolDefinition,
  listMapLayersToolName,
  setLayerStyleToolDefinition,
  setLayerStyleToolName,
  removeMapLayerToolDefinition,
  removeMapLayerToolName,
  type SetLayerStyleParams,
  type RemoveMapLayerParams
} from '../../../llm-tools/map-layer-management-tools'
import { resolveLocalLayerFilePath } from '../../../../shared/lib/layer-source-paths'
import type { ToolRegistry } from '../tool-registry'
import type { MapLayerTracker } from '../map-layer-tracker'
import { getLayerDbService } from '../../layer-database-service'
import { getRuntimeLayerSnapshot } from '../../../ipc/layer-handlers'

export interface MapLayerManagementDependencies {
  mapLayerTracker: MapLayerTracker
}

type RuntimeLayerRecord = {
  id?: string
  name?: string
  sourceId?: string
  sourceConfig?: {
    type?: string
    data?: unknown
    options?: {
      rasterSourcePath?: string
    }
  }
  type?: string
  geometryType?: string
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
  visibility?: boolean
  opacity?: number
  zIndex?: number
  metadata?: {
    geometryType?: string
    tags?: string[]
    description?: string
    bounds?: [number, number, number, number]
    featureCount?: number
    context?: Record<string, unknown>
  }
}

function asRuntimeLayer(value: unknown): RuntimeLayerRecord | null {
  return value && typeof value === 'object' ? (value as RuntimeLayerRecord) : null
}

function getAvailableRuntimeLayers(): RuntimeLayerRecord[] {
  const runtimeLayers = Array.isArray(getRuntimeLayerSnapshot()) ? getRuntimeLayerSnapshot() : []

  return runtimeLayers
    .map((layer) => asRuntimeLayer(layer))
    .filter((layer): layer is RuntimeLayerRecord => Boolean(layer))
    .filter((layer) => typeof layer.sourceId === 'string' && layer.sourceId.length > 0)
}

export function registerMapLayerManagementTools(
  registry: ToolRegistry,
  deps: MapLayerManagementDependencies
): void {
  const layerDbService = getLayerDbService()
  const { mapLayerTracker } = deps

  registry.register({
    name: listMapLayersToolName,
    definition: listMapLayersToolDefinition,
    category: 'map_layer_management',
    execute: async () => {
      const persistedLayers = layerDbService.getAllLayers()
      const persistedIds = new Set(persistedLayers.map((layer) => layer.id))
      const persistedSourceIds = new Set(persistedLayers.map((layer) => layer.sourceId))
      const layers = getAvailableRuntimeLayers().map((layer) => {
        const localFilePath = resolveLocalLayerFilePath(layer)
        const persistedInDatabase = Boolean(
          (layer.id && persistedIds.has(layer.id)) ||
          (layer.sourceId && persistedSourceIds.has(layer.sourceId))
        )

        return {
          id: layer.id,
          name: layer.name,
          sourceId: layer.sourceId,
          sourceType: layer.sourceConfig?.type,
          type: layer.type,
          geometryType: layer.geometryType || layer.metadata?.geometryType || 'Unknown',
          createdBy: layer.createdBy,
          createdAt: layer.createdAt,
          updatedAt: layer.updatedAt,
          visibility: layer.visibility,
          opacity: layer.opacity,
          zIndex: layer.zIndex,
          tags: layer.metadata?.tags || [],
          description: layer.metadata?.description,
          bounds: layer.metadata?.bounds,
          featureCount: layer.metadata?.featureCount,
          ...(localFilePath ? { localFilePath } : {}),
          persistedInDatabase,
          managedBy: 'layer_store' as const
        }
      })

      if (layers.length === 0) {
        return {
          status: 'success',
          message: 'No map layers are currently available.',
          layers: []
        }
      }

      return {
        status: 'success',
        message: `Found ${layers.length} available map layer(s).`,
        layers
      }
    }
  })

  registry.register({
    name: setLayerStyleToolName,
    definition: setLayerStyleToolDefinition,
    category: 'map_layer_management',
    execute: async ({ args }) => {
      const params = args as SetLayerStyleParams
      const runtimeLayer = getAvailableRuntimeLayers().find(
        (layer) => layer.sourceId === params.source_id
      )
      const trackedLayer = mapLayerTracker.hasLayer(params.source_id)

      if (!runtimeLayer && !trackedLayer) {
        return {
          status: 'error',
          message: `Layer with source ID "${params.source_id}" is not currently available.`,
          source_id: params.source_id
        }
      }

      if (!params.paint || Object.keys(params.paint).length === 0) {
        return {
          status: 'success',
          message: 'No paint properties provided. No style changes applied.',
          source_id: params.source_id
        }
      }

      const mainWindow = mapLayerTracker.getMainWindow()
      if (!mainWindow) {
        return {
          status: 'error',
          message: 'Internal error: Main window not available to send style update.',
          source_id: params.source_id
        }
      }

      mainWindow.webContents.send('ctg:map:setPaintProperties', {
        sourceId: params.source_id,
        paintProperties: params.paint
      })

      return {
        status: 'success',
        message: `Styling request for layer ${params.source_id} sent. Check renderer console for map update logs.`,
        source_id: params.source_id,
        applied_properties: params.paint
      }
    }
  })

  registry.register({
    name: removeMapLayerToolName,
    definition: removeMapLayerToolDefinition,
    category: 'map_layer_management',
    execute: async ({ args }) => {
      const params = args as RemoveMapLayerParams
      const runtimeLayer = getAvailableRuntimeLayers().find(
        (layer) => layer.sourceId === params.source_id
      )
      const trackedLayer = mapLayerTracker.hasLayer(params.source_id)

      if (!runtimeLayer && !trackedLayer) {
        return {
          status: 'error',
          message: `Layer with source ID "${params.source_id}" is not currently available. Cannot remove.`,
          source_id: params.source_id
        }
      }

      const mainWindow = mapLayerTracker.getMainWindow()
      if (!mainWindow) {
        return {
          status: 'error',
          message: 'Internal error: Main window not available to send remove layer command.',
          source_id: params.source_id
        }
      }

      if (trackedLayer) {
        mapLayerTracker.removeLayer(params.source_id)
      }

      mainWindow.webContents.send('ctg:map:removeSourceAndLayers', {
        sourceId: params.source_id
      })

      return {
        status: 'success',
        message: `Request to remove layer with source ID "${params.source_id}" sent. It should now be removed from the map and layer list.`,
        removed_source_id: params.source_id
      }
    }
  })
}
