import { z } from 'zod'
import {
  qgisAlgorithmIdSchema,
  qgisImportPreferenceSchema,
  qgisTimeoutMsSchema
} from './qgis-tool-common'

export const qgisRunProcessingToolName = 'qgis_run_processing'

export const QgisRunProcessingParamsSchema = z.object({
  algorithmId: qgisAlgorithmIdSchema,
  parameters: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      'Algorithm-specific QGIS Processing parameters as key/value pairs. Put INPUT, OUTPUT, EXPRESSION, ASCENDING, DISTANCE, and similar fields here exactly as described by qgis_describe_algorithm. When operating on a map layer, use list_map_layers.integrationInputs.qgis.inputPath when available, or fall back to localFilePath if the layer is file-backed. For multi-step analyses, feed a returned output artifact path into the next run. Use TEMPORARY_OUTPUT for intermediate outputs when the algorithm supports it.'
    ),
  projectPath: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional local .qgs or .qgz project path to use during the QGIS run.'),
  expectedOutputs: z
    .array(z.string().trim().min(1))
    .max(20)
    .optional()
    .describe(
      'Optional output paths you expect QGIS to create. Use this when you want Arion to track artifacts even if the algorithm response does not echo them clearly. For final outputs that should appear on the map, prefer a named `.gpkg`, `.geojson`, `.tif`, or `.tiff` path.'
    ),
  importPreference: qgisImportPreferenceSchema.describe(
    'How Arion should handle supported output datasets after the run: auto imports them into the map, suggest leaves them as artifacts only, none skips import handling. Omit this or use auto when the user expects a new visible map layer.'
  ),
  timeoutMs: qgisTimeoutMsSchema.describe('Optional QGIS execution timeout in milliseconds.')
})

export type QgisRunProcessingParams = z.infer<typeof QgisRunProcessingParamsSchema>

export const qgisRunProcessingToolDefinition = {
  description:
    'Runs an approved QGIS Processing algorithm against local datasets. Pass the algorithm id plus direct algorithm parameters in the `parameters` object, use qgis_describe_algorithm first when you need exact parameter names, use list_map_layers.integrationInputs.qgis.inputPath for file-backed map layers when available, and compose multi-step QGIS analyses by chaining artifact paths between runs. When creating a final output that should appear as a new map layer, write it to a named `.gpkg`, `.geojson`, `.tif`, or `.tiff` file and leave importPreference as auto; do not rely on TEMPORARY_OUTPUT for the final map-visible result.',
  inputSchema: QgisRunProcessingParamsSchema
}
