import { z } from 'zod'

// Schema for the coordinates array
// It's an array of four [longitude, latitude] pairs (WGS84 decimal degrees)
const CoordinatesSchema = z
  .array(z.array(z.number()).length(2))
  .length(4)
  .describe(
    'An array of four [longitude, latitude] pairs (WGS84 decimal degrees) representing the image corners in the order: top-left, top-right, bottom-right, bottom-left.'
  )

// Schema for the tool parameters
const AddGeoreferencedImageLayerParamsSchema = z.object({
  image_url: z
    .string()
    .describe(
      'The fully qualified URL (e.g., http://, https://) or absolute local file path to the georeferenced image (e.g., PNG, JPEG). The URL must be accessible by the application, and file paths must be readable by the main process.'
    ),
  coordinates: CoordinatesSchema,
  source_id: z
    .string()
    .optional()
    .describe(
      'Optional unique ID for the map image source. If not provided, one will be generated.'
    ),
  layer_id: z
    .string()
    .optional()
    .describe(
      'Optional unique ID for the map raster layer. If not provided, one will be generated.'
    ),
  fit_bounds: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether the map should automatically zoom/pan to fit the new image layer.'),
  opacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(1)
    .describe(
      'The opacity of the raster layer, from 0 (completely transparent) to 1 (completely opaque). This is currently fixed to 1.0 (fully opaque) for display purposes.'
    )
})

// Tool definition for Vercel AI SDK / LangChain
export const addGeoreferencedImageLayerToolDefinition = {
  description:
    'Adds a georeferenced image (e.g., a PNG from a URL) as a new layer on the map. The image is positioned using its four corner coordinates. The image URL must be accessible to the application for display.',
  inputSchema: AddGeoreferencedImageLayerParamsSchema
}

export const addGeoreferencedImageLayerToolName = 'add_georeferenced_image_layer'

// Type for parameters for internal use within LlmToolService
export type AddGeoreferencedImageLayerParams = z.infer<
  typeof AddGeoreferencedImageLayerParamsSchema
>

// Interface for the IPC payload to the renderer - this could be identical to AddGeoreferencedImageLayerParams
// or include generated IDs if we decide to always generate them in LlmToolService before sending.
// For now, the renderer can handle generating default IDs if not supplied in the payload.
export interface AddGeoreferencedImageLayerPayload {
  imageUrl: string
  coordinates: number[][] // Changed from Array<[number, number]>
  sourceId?: string
  layerId?: string
  fitBounds?: boolean
  opacity?: number
}
