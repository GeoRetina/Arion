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
      'Optional keyword search applied to QGIS algorithm ids, display names, and providers. Use this to narrow discovery to terms like "buffer", "field calculator", "extract", or "order by".'
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
    'Lists QGIS Processing algorithms available through the configured local QGIS installation so you can discover an algorithm id to pass into qgis_describe_algorithm or qgis_run_processing. Prefer using `query`, `provider`, and `limit` to narrow the result set instead of requesting the full algorithm catalog.',
  inputSchema: QgisListAlgorithmsParamsSchema
}
