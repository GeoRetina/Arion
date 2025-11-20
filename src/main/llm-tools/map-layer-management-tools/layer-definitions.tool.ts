import { z } from 'zod'

// --- List Map Layers Tool ---
export const listMapLayersToolName = 'list_map_layers'

export const ListMapLayersToolSchema = z.object({}) // No parameters for listing

export const listMapLayersToolDefinition = {
  description:
    'Lists session (non-persisted) layers currently in the renderer layer store, including their IDs, source IDs, geometry/type info, and basic metadata.',
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
      'An object of MapLibre paint properties to apply (e.g., { "fill-color": "#FF0000", "fill-opacity": 0.7 }). This object should be provided under the key "paint". Refer to MapLibre GL JS documentation for valid properties based on layer type. If omitted, no style changes will be applied.'
    )
})

export type SetLayerStyleParams = z.infer<typeof SetLayerStyleToolSchema>

export const setLayerStyleToolDefinition = {
  description:
    "Changes the visual style of a specified map layer using its source ID. Allows modification of MapLibre paint properties like color, opacity, size, etc. The paint properties object should be provided under the key 'paint'. The LLM should use its knowledge of MapLibre GL JS paint properties appropriate for the layer's geometry type.",
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
    "Removes a previously added map layer (and its associated source) from the map using its unique source ID. Use 'list_map_layers' to find the source ID of the layer you want to remove.",
  inputSchema: RemoveMapLayerToolSchema
}

// Interface for storing information about added layers in LlmToolService
export type MapLayerGeometryType = 'Point' | 'Polygon' | 'LineString' | 'Unknown' | 'raster'

export interface AddedLayerInfo {
  sourceId: string
  toolName: string // e.g., add_map_point, create_map_buffer
  addedAt: string // ISO timestamp
  originalParams: Record<string, any> // The original parameters passed to the tool that added the layer
  geometryType: MapLayerGeometryType // The general type of geometry added
  layerId?: string // Optional: If a specific layer ID was used or generated
}
