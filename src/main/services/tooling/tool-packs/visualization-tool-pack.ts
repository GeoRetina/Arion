import {
  addMapFeatureToolDefinition,
  addMapFeatureToolName,
  createGeoJSONFeature,
  type AddMapFeatureParams
} from '../../../llm-tools/visualization-tools/add-vector-feature-tool'
import {
  addGeoreferencedImageLayerToolDefinition,
  addGeoreferencedImageLayerToolName,
  type AddGeoreferencedImageLayerParams,
  type AddGeoreferencedImageLayerPayload
} from '../../../llm-tools/visualization-tools/add-georeference-image-layer-tool'
import {
  displayChartToolDefinition,
  displayChartToolName,
  type DisplayChartParams
} from '../../../llm-tools/visualization-tools/display-chart-tool'
import {
  createGeoJSONBuffer,
  createMapBufferToolDefinition,
  createMapBufferToolName,
  type CreateMapBufferParams
} from '../../../llm-tools/basic-geospatial-tools'
import type { AddedLayerInfo } from '../../../llm-tools/map-layer-management-tools'
import type { ToolRegistry } from '../tool-registry'
import type { MapLayerTracker } from '../map-layer-tracker'
import { convertImageFileToDataUri } from '../../../lib/image-processing'
import type { Feature, Geometry } from 'geojson'

export interface VisualizationToolDependencies {
  mapLayerTracker: MapLayerTracker
}

export function registerVisualizationTools(
  registry: ToolRegistry,
  deps: VisualizationToolDependencies
): void {
  const { mapLayerTracker } = deps

  registry.register({
    name: addMapFeatureToolName,
    definition: addMapFeatureToolDefinition,
    category: 'visualization',
    execute: async ({ args, sourceIdPrefix = 'llm-tool' }) => {
      const params = args as AddMapFeatureParams
      const feature = createGeoJSONFeature(params)
      const sourceId = `${sourceIdPrefix}-${addMapFeatureToolName}-${Date.now()}`
      mapLayerTracker.sendFeatureToMap(feature, {
        sourceId,
        fitBounds: true
      })
      const layerInfo: AddedLayerInfo = {
        sourceId,
        toolName: addMapFeatureToolName,
        addedAt: new Date().toISOString(),
        originalParams: params,
        geometryType: feature.geometry.type
      }
      mapLayerTracker.recordLayer(layerInfo)
      return {
        status: 'success',
        message: `${feature.geometry.type} added to map with source ID: ${sourceId}.`,
        sourceId: sourceId,
        geojson: feature
      }
    }
  })

  registry.register({
    name: addGeoreferencedImageLayerToolName,
    definition: addGeoreferencedImageLayerToolDefinition,
    category: 'visualization',
    execute: async ({ args, sourceIdPrefix = 'llm-tool' }) => {
      const params = args as AddGeoreferencedImageLayerParams
      const sourceId =
        params.source_id ||
        `${sourceIdPrefix}-${addGeoreferencedImageLayerToolName}-source-${Date.now()}`
      const layerId =
        params.layer_id ||
        `${sourceIdPrefix}-${addGeoreferencedImageLayerToolName}-layer-${Date.now()}`

      const mainWindow = mapLayerTracker.getMainWindow()
      if (!mainWindow) {
        return {
          status: 'error',
          message: 'Internal error: Main window not available to add georeferenced image layer.'
        }
      }

      let imageUrlForRenderer: string

      try {
        if (params.image_url.startsWith('http')) {
          imageUrlForRenderer = params.image_url
        } else {
          imageUrlForRenderer = await convertImageFileToDataUri(params.image_url)
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error during image processing.'
        return {
          status: 'error',
          message: `Failed to process image at ${params.image_url}: ${errorMessage}`
        }
      }

      const ipcPayload: AddGeoreferencedImageLayerPayload = {
        imageUrl: imageUrlForRenderer,
        coordinates: params.coordinates,
        sourceId: sourceId,
        layerId: layerId,
        fitBounds: params.fit_bounds,
        opacity: 1.0
      }

      mainWindow.webContents.send('ctg:map:addGeoreferencedImageLayer', ipcPayload)

      const layerInfo: AddedLayerInfo = {
        sourceId,
        toolName: addGeoreferencedImageLayerToolName,
        addedAt: new Date().toISOString(),
        originalParams: params,
        geometryType: 'raster',
        layerId: layerId
      }
      mapLayerTracker.recordLayer(layerInfo)

      return {
        status: 'success',
        message: `Request to add georeferenced image layer "${layerId}" from URL "${params.image_url}" sent. The image should now be visible on the map with source ID "${sourceId}".`,
        sourceId: sourceId,
        layerId: layerId,
        imageUrl: params.image_url,
        coordinates: params.coordinates
      }
    }
  })

  registry.register({
    name: displayChartToolName,
    definition: displayChartToolDefinition,
    category: 'visualization',
    execute: async ({ args }) => {
      const params = args as DisplayChartParams
      const chartId = `chart-${Date.now()}`

      return {
        status: 'success',
        message: `Chart data prepared for display (ID: ${chartId}). The UI should render this chart inline.`,
        chartId: chartId,
        chartType: params.chartType,
        data: params.data,
        config: params.config
      }
    }
  })

  registry.register({
    name: createMapBufferToolName,
    definition: createMapBufferToolDefinition,
    category: 'geospatial_basic',
    execute: async ({ args, sourceIdPrefix = 'llm-tool' }) => {
      const params = args as CreateMapBufferParams
      const bufferFeature = createGeoJSONBuffer(params)
      const sourceId = `${sourceIdPrefix}-${createMapBufferToolName}-${Date.now()}`
      mapLayerTracker.sendFeatureToMap(bufferFeature as Feature<Geometry>, {
        sourceId,
        fitBounds: true
      })
      const layerInfo: AddedLayerInfo = {
        sourceId,
        toolName: createMapBufferToolName,
        addedAt: new Date().toISOString(),
        originalParams: params,
        geometryType: 'Polygon'
      }
      mapLayerTracker.recordLayer(layerInfo)
      return {
        status: 'success',
        message: `Buffer of ${params.radius} ${params.units} created at [${params.longitude}, ${params.latitude}] with source ID: ${sourceId}.`,
        sourceId: sourceId,
        geojson: bufferFeature
      }
    }
  })
}
