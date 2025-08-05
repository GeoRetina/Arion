import { z } from 'zod'
import type { Feature, Point, Polygon } from 'geojson'
import * as turf from '@turf/turf'

export const createMapBufferToolName = 'create_map_buffer'

/**
 * Schema for the 'create_map_buffer' tool.
 */
export const CreateMapBufferToolSchema = z.object({
  longitude: z.number().min(-180).max(180).describe("Longitude of the buffer's center point."),
  latitude: z.number().min(-90).max(90).describe("Latitude of the buffer's center point."),
  radius: z.number().positive().describe('Radius of the buffer.'),
  units: z
    .enum(['kilometers', 'miles', 'meters', 'degrees'])
    .default('kilometers')
    .describe('Units for the radius.'),
  properties: z
    .record(z.any())
    .optional()
    .describe('Optional GeoJSON properties for the buffer polygon.')
})

export type CreateMapBufferParams = z.infer<typeof CreateMapBufferToolSchema>

/**
 * Creates a GeoJSON Polygon feature representing a buffer around a point.
 * Uses Turf.js for the geospatial operation.
 *
 * @param params - Parameters for creating the buffer.
 * @returns A GeoJSON Polygon feature representing the buffer.
 */
export function createGeoJSONBuffer(params: CreateMapBufferParams): Feature<Polygon> {
  const { longitude, latitude, radius, units, properties } = params
  const centerPoint = turf.point([longitude, latitude])
  const bufferedPolygon = turf.buffer(centerPoint, radius, { units })

  if (!bufferedPolygon) {
    throw new Error('[BufferTool] Failed to generate buffer: turf.buffer returned undefined.')
  }

  // turf.buffer returns a Feature<Polygon | MultiPolygon>. We expect a Polygon for simple point buffers.
  // For simplicity, we'll assume it's a Polygon. Add error handling if MultiPolygon is possible and needs specific handling.
  if (bufferedPolygon.geometry.type !== 'Polygon') {
    // This case should ideally not happen for a simple point buffer with valid positive radius.
    // If it does, we might need to handle MultiPolygon or throw a more specific error.
    // Fallback or throw: for now, let's try to return it as is, but this might cause issues downstream if only Polygon is expected.
    // A more robust solution would be to ensure the output is always a simple Polygon or handle MultiPolygon explicitly.
  }

  const bufferFeature: Feature<Polygon> = {
    type: 'Feature',
    geometry: bufferedPolygon.geometry as Polygon, // Casting, be mindful of the warning above
    properties: {
      ...(properties || {}),
      buffer_center_lon: longitude,
      buffer_center_lat: latitude,
      buffer_radius: radius,
      buffer_units: units,
      generated_by_tool: createMapBufferToolName
    }
  }
  return bufferFeature
}

/**
 * Tool definition for Vercel AI SDK.
 */
export const createMapBufferToolDefinition = {
  description:
    'Creates a circular buffer (polygon) around a specified point (latitude, longitude) with a given radius and units. Displays the buffer on the map.',
  parameters: CreateMapBufferToolSchema
  // execute function will be handled by LlmToolService
}
