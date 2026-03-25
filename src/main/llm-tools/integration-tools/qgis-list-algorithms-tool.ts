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
      'Optional natural-language task phrase used to rank QGIS algorithms by relevance. Prefer describing the next atomic step, such as "sort line features by length descending", "extract features matching an expression", "clip parcels to a boundary", or "join polygons by attribute", instead of sending only a vague keyword. For multi-step tasks like "top 10 longest lines", search the ranking step first, then search the extraction step if needed.'
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
    'Lists QGIS Processing algorithms available through the configured local QGIS installation and ranks them using a cached structured catalog built from QGIS metadata. Use this to discover likely algorithm candidates before qgis_describe_algorithm or qgis_run_processing. Prefer using `query`, `provider`, and `limit` to get a relevant shortlist instead of requesting the full catalog. For compound workflows, search the immediate step you are about to run, not the whole workflow at once.',
  inputSchema: QgisListAlgorithmsParamsSchema
}
