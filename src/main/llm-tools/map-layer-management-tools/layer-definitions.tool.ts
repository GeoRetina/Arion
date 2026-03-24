import { z } from 'zod'

// --- List Map Layers Tool ---
export const listMapLayersToolName = 'list_map_layers'

export const ListMapLayersToolSchema = z.object({}) // No parameters for listing

export const listMapLayersToolDefinition = {
  description:
    'Lists map layers currently available in the renderer layer store, including their IDs, source IDs, geometry/type info, persistence state, basic metadata, local filesystem paths when available, and integration-specific input hints when available, for example `integrationInputs.qgis.inputPath` for supported file-backed datasets that can be passed directly into `qgis_run_processing`.',
  inputSchema: ListMapLayersToolSchema
}

// --- Set Layer Style Tool ---
export const setLayerStyleToolName = 'set_layer_style'

export const SetLayerStyleToolSchema = z.object({
  source_id: z
    .string()
    .describe(
      'The unique source ID of the layer to style. This ID was provided when the layer was added.'
    ),
  paint: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      'Optional MapLibre paint properties to apply to the live Arion map layer (for example { "fill-color": "#FF0000", "fill-opacity": 0.7 } or expression-based values).'
    ),
  layout: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      'Optional MapLibre layout properties to apply to the live Arion map layer (for example { "line-cap": "round" } or { "icon-image": "marker" }).'
    ),
  filter: z
    .array(z.unknown())
    .max(1000)
    .optional()
    .describe('Optional MapLibre filter expression array to apply to the live Arion map layer.')
})

export type SetLayerStyleParams = z.infer<typeof SetLayerStyleToolSchema>

export const setLayerStyleToolDefinition = {
  description:
    "Changes the live Arion map styling for a specified layer using its source ID. Use 'list_map_layers' first when you need to discover the correct source ID. Supports MapLibre paint properties, layout properties, and filter expressions. This updates the rendered layer on the map rather than creating or requiring a QGIS style file.",
  inputSchema: SetLayerStyleToolSchema
}

// --- Remove Map Layer Tool ---
export const removeMapLayerToolName = 'remove_map_layer'

export const RemoveMapLayerToolSchema = z.object({
  source_id: z
    .string()
    .describe(
      "The unique source ID of the layer to remove. This ID was provided when the layer was added and can be listed using 'list_map_layers'."
    )
})

export type RemoveMapLayerParams = z.infer<typeof RemoveMapLayerToolSchema>

export const removeMapLayerToolDefinition = {
  description:
    "Removes a map layer (and its associated source) from the map using its unique source ID. Use 'list_map_layers' to find the source ID of the layer you want to remove.",
  inputSchema: RemoveMapLayerToolSchema
}

// Interface for storing information about added layers in LlmToolService
export type MapLayerGeometryType = 'Point' | 'Polygon' | 'LineString' | 'Unknown' | 'raster'

export interface AddedLayerInfo {
  sourceId: string
  toolName: string // e.g., add_map_point, create_map_buffer
  addedAt: string // ISO timestamp
  originalParams: Record<string, unknown> // The original parameters passed to the tool that added the layer
  geometryType: MapLayerGeometryType // The general type of geometry added
  layerId?: string // Optional: If a specific layer ID was used or generated
}
