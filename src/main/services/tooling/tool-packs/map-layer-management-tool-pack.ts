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
import type { ToolRegistry } from '../tool-registry'
import type { MapLayerTracker } from '../map-layer-tracker'

export interface MapLayerManagementDependencies {
  mapLayerTracker: MapLayerTracker
}

export function registerMapLayerManagementTools(
  registry: ToolRegistry,
  deps: MapLayerManagementDependencies
) {
  const { mapLayerTracker } = deps

  registry.register({
    name: listMapLayersToolName,
    definition: listMapLayersToolDefinition,
    category: 'map_layer_management',
    execute: async () => {
      const layers = mapLayerTracker.listLayers()
      if (layers.length === 0) {
        return {
          status: 'success',
          message: 'No layers have been programmatically added to the map yet.',
          layers: []
        }
      }
      return {
        status: 'success',
        message: `Found ${layers.length} programmatically added layer(s).`,
        layers: layers.map((l) => ({
          sourceId: l.sourceId,
          toolName: l.toolName,
          addedAt: l.addedAt,
          parameters: l.originalParams,
          geometryType: l.geometryType
        }))
      }
    }
  })

  registry.register({
    name: setLayerStyleToolName,
    definition: setLayerStyleToolDefinition,
    category: 'map_layer_management',
    execute: async ({ args }) => {
      const params = args as SetLayerStyleParams

      if (!mapLayerTracker.hasLayer(params.source_id)) {
        return {
          status: 'error',
          message: `Layer with source ID "${params.source_id}" not found or was not added by a tool.`,
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

      if (!mapLayerTracker.hasLayer(params.source_id)) {
        return {
          status: 'error',
          message: `Layer with source ID "${params.source_id}" not found or was not added by a tool. Cannot remove.`,
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

      mapLayerTracker.removeLayer(params.source_id)

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
