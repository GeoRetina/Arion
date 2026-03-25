import { z } from 'zod'
import { qgisTimeoutMsSchema } from './qgis-tool-common'

export const qgisListAlgorithmsToolName = 'qgis_list_algorithms'

export const QgisListAlgorithmsParamsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Optional natural-language search phrase for the next atomic QGIS step. Start with a concise task description such as "sort line features by length descending", "extract features matching an expression", "clip parcels to a boundary", or "join polygons by attribute". If the shortlist is weak or ambiguous, retry with alternate phrasings or exact words from candidate algorithm names before choosing an algorithm id.'
    ),
  provider: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .describe(
      'Optional QGIS provider id to filter by, such as `native` or `gdal`. Omit this when you want results from every available provider.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Optional maximum number of matching algorithms to return after filtering. Use a small limit when you only need a shortlist.'
    ),
  timeoutMs: qgisTimeoutMsSchema
})

export type QgisListAlgorithmsParams = z.infer<typeof QgisListAlgorithmsParamsSchema>

export const qgisListAlgorithmsToolDefinition = {
  description:
    'Searches QGIS Processing algorithms available through the configured local QGIS installation using cached factual metadata from QGIS itself, including ids, names, help summaries, and parameter details when available. Use this iteratively to discover plausible algorithm ids before qgis_describe_algorithm or qgis_run_processing. Prefer searching the immediate step you are about to run, keep the shortlist small with `limit`, and if the first search is ambiguous, refine the query and search again instead of guessing.',
  inputSchema: QgisListAlgorithmsParamsSchema
}
