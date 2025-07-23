import { z } from 'zod'

export const setMapViewToolName = 'set_map_view'

export const SetMapViewToolSchema = z
  .object({
    center: z
      .array(z.number())
      .length(2)
      .optional()
      .describe('Optional. The new map center as [longitude, latitude]. E.g., [-74.0060, 40.7128]'),
    zoom: z
      .number()
      .min(0)
      .max(24)
      .optional()
      .describe('Optional. The new zoom level (typically 0-22).'),
    pitch: z
      .number()
      .min(0)
      .max(85)
      .optional()
      .describe(
        'Optional. The new pitch (tilt) of the map in degrees (0-85). 0 is looking straight down.'
      ),
    bearing: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe('Optional. The new bearing (rotation) of the map in degrees (0-360). 0 is North.'),
    animate: z
      .boolean()
      .optional()
      .default(true)
      .describe('Optional. Whether to animate the transition to the new view. Defaults to true.')
  })
  .refine(
    (data) =>
      data.center ||
      data.zoom !== undefined ||
      data.pitch !== undefined ||
      data.bearing !== undefined,
    {
      message: 'At least one view parameter (center, zoom, pitch, or bearing) must be provided.'
    }
  )

export type SetMapViewParams = z.infer<typeof SetMapViewToolSchema>

export const setMapViewToolDefinition = {
  description:
    'Adjusts the map view by setting its center, zoom level, pitch (tilt), and/or bearing (rotation). At least one parameter must be provided. Animation is enabled by default.',
  parameters: SetMapViewToolSchema
}
