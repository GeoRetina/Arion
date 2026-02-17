import { z } from 'zod'
import type { Point, LineString, Polygon, Feature, Position } from 'geojson'

export const addMapFeatureToolName = 'add_map_feature'

// Detailed coordinate schemas for internal validation after parsing the JSON string
const CoordinateSchemaInternal = z.tuple([
  z.number().min(-180).max(180), // longitude
  z.number().min(-90).max(90) // latitude
])

const LineStringCoordinatesSchemaInternal = z.array(CoordinateSchemaInternal).min(2, {
  message: 'LineString must have at least two coordinate pairs.'
})

const PolygonCoordinatesSchemaInternal = z
  .array(LineStringCoordinatesSchemaInternal) // Array of linear rings
  .min(1, { message: 'Polygon must have at least one linear ring.' })
  .refine(
    (rings) =>
      rings.every(
        (ring) => ring.length >= 4 && ring[0].every((val, i) => val === ring[ring.length - 1][i])
      ),
    {
      message:
        'Each ring in a Polygon must have at least 4 coordinate pairs and be closed (first and last points identical).'
    }
  )

/**
 * Schema for the 'add_map_feature' tool (for LLM).
 * Defines the expected input parameters for adding a vector feature to the map.
 */
export const AddMapFeatureToolSchema = z.object({
  featureType: z
    .enum(['Point', 'LineString', 'Polygon'])
    .describe('The type of GeoJSON feature to add.'),
  coordinates: z
    .string()
    .describe(
      "A JSON string representing the coordinates. Examples: For Point: '[10, 20]'. For LineString: '[[10,20],[30,40]]'. For Polygon: '[[[0,0],[0,10],[10,10],[10,0],[0,0]]]' (ensure rings are closed and have >= 4 points)."
    ),
  properties: z
    .record(z.any())
    .optional()
    .describe('Optional GeoJSON properties to associate with the feature.'),
  label: z
    .string()
    .optional()
    .describe('An optional label for the feature, which could be stored in properties.')
})
// The .refine for coordinate structure is removed here as 'coordinates' is now a string.
// Validation will happen after parsing in createGeoJSONFeature.

export type AddMapFeatureParams = z.infer<typeof AddMapFeatureToolSchema>

/**
 * Creates a GeoJSON Feature (Point, LineString, or Polygon).
 *
 * @param params - The parameters for creating the feature, where 'coordinates' is a JSON string.
 * @returns A GeoJSON Feature.
 * @throws Error if featureType is unknown, coordinates JSON string is invalid, or parsed coordinates are invalid for the type.
 */
export function createGeoJSONFeature(
  params: AddMapFeatureParams
): Feature<Point | LineString | Polygon> {
  const { featureType, coordinates: coordinatesString, properties, label } = params

  const baseProperties: Record<string, any> = {
    ...(properties || {}),
    generated_by_tool: addMapFeatureToolName
  }

  if (label) {
    baseProperties.label = label // Add or overwrite label
  }

  const featureProperties = baseProperties

  let parsedCoordinates: any
  try {
    parsedCoordinates = JSON.parse(coordinatesString)
  } catch (e) {
    throw new Error(`Invalid JSON string for coordinates: ${(e as Error).message}`)
  }

  switch (featureType) {
    case 'Point': {
      const pointValidation = CoordinateSchemaInternal.safeParse(parsedCoordinates)
      if (!pointValidation.success) {
        throw new Error(
          `Invalid coordinates for Point after parsing. Expected [lon, lat]. Errors: ${pointValidation.error.errors.map((e) => e.message).join(', ')}`
        )
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: pointValidation.data as Position
        },
        properties: featureProperties
      } as Feature<Point>
    }

    case 'LineString': {
      const lineValidation = LineStringCoordinatesSchemaInternal.safeParse(parsedCoordinates)
      if (!lineValidation.success) {
        throw new Error(
          `Invalid coordinates for LineString after parsing. Expected [[lon, lat], ...]. Errors: ${lineValidation.error.errors.map((e) => e.message).join(', ')}`
        )
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineValidation.data as Position[]
        },
        properties: featureProperties
      } as Feature<LineString>
    }

    case 'Polygon': {
      const polygonValidation = PolygonCoordinatesSchemaInternal.safeParse(parsedCoordinates)
      if (!polygonValidation.success) {
        throw new Error(
          `Invalid coordinates for Polygon after parsing. Expected [[[lon, lat], ...]]. Errors: ${polygonValidation.error.errors.map((e) => e.message).join(', ')}`
        )
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: polygonValidation.data as Position[][]
        },
        properties: featureProperties
      } as Feature<Polygon>
    }

    default:
      // This should ideally be caught by Zod enum validation earlier in AddMapFeatureToolSchema
      throw new Error(`Unsupported featureType: ${featureType}`)
  }
}

/**
 * Describes the tool for the Vercel AI SDK.
 */
export const addMapFeatureToolDefinition = {
  description:
    'Creates and displays a vector feature (Point, LineString, or Polygon) on the map. Requires featureType and corresponding coordinates as a JSON string. Optionally accepts properties and a label.',
  inputSchema: AddMapFeatureToolSchema
}
