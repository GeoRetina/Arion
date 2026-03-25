import { z } from 'zod'
import {
  qgisAlgorithmIdSchema,
  qgisImportPreferenceSchema,
  qgisTimeoutMsSchema
} from './qgis-tool-common'

export const qgisRunProcessingToolName = 'qgis_run_processing'

export const QgisRunProcessingParamsSchema = z.object({
  algorithmId: qgisAlgorithmIdSchema,
  workflowId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe(
      'Optional QGIS workflow id returned by a previous qgis_run_processing call. Reuse it when chaining multiple QGIS steps so they share the same managed workspace and output directory. Omit it on the first step to start a new workflow.'
    ),
  parameters: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      'Algorithm-specific QGIS Processing parameters as key/value pairs. Put INPUT, OUTPUT, EXPRESSION, ASCENDING, DISTANCE, and similar fields here exactly as described by qgis_describe_algorithm. When operating on a map layer, use list_map_layers.integrationInputs.qgis.inputPath when available, or fall back to localFilePath if the layer is file-backed. When reusing a prior QGIS output in the same workflow, you can pass `artifact:<artifactId>` as an input value instead of a filesystem path. For output values, prefer simple relative names like `sorted_lines.geojson` or `top_10_longest.gpkg`; Arion resolves them inside the managed workflow output directory. Use TEMPORARY_OUTPUT only for temporary outputs that stay within a single algorithm run.'
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
  outputsToImport: z
    .array(z.string().trim().min(1))
    .max(20)
    .optional()
    .describe(
      'Optional subset of generated outputs that Arion should import into the map when importPreference is auto. Entries can be relative output names like `top_10_longest_features.geojson`, absolute managed-workspace paths, or `artifact:<artifactId>` handles returned by earlier QGIS steps in the same workflow. Use this to keep helper or complement outputs off the map. Only import layers that add value and what the user expects to see on the map. Strongly avoid duplicate layers or layers that seem to be redundant. For example, the user is generally interested in seeing the final result layer on the map.'
    ),
  importPreference: qgisImportPreferenceSchema.describe(
    'How Arion should handle supported output datasets after the run: auto imports them into the map, suggest leaves them as artifacts only, none skips import handling. Omit this or use auto when the user expects a new visible map layer.'
  ),
  timeoutMs: qgisTimeoutMsSchema.describe('Optional QGIS execution timeout in milliseconds.')
})

export type QgisRunProcessingParams = z.infer<typeof QgisRunProcessingParamsSchema>

export const qgisRunProcessingToolDefinition = {
  description:
    'Runs an approved QGIS Processing algorithm against local datasets. Pass the algorithm id plus direct algorithm parameters in the `parameters` object, use qgis_describe_algorithm first when you need exact parameter names, use list_map_layers.integrationInputs.qgis.inputPath for file-backed map layers when available, and compose multi-step QGIS analyses by reusing the returned workflowId plus artifact handles between runs. Successful runs return artifact details plus compact output summaries so you can inspect feature counts, geometry, bounds, CRS, and source IDs for imported layers before deciding the next step. When a run creates helper outputs and final outputs together, keep importPreference as auto but set outputsToImport so only the intended final dataset is loaded on the map. When creating a final output that should appear as a new map layer, write it to a named `.gpkg`, `.geojson`, `.tif`, or `.tiff` file or a simple relative filename inside the workflow output directory; do not rely on TEMPORARY_OUTPUT for the final map-visible result.',
  inputSchema: QgisRunProcessingParamsSchema
}
