import { z } from 'zod'

export const geeListAlgorithmsToolName = 'gee_list_algorithms'

export const GeeListAlgorithmsParamsSchema = z.object({
  pageSize: z.number().int().min(1).max(100).optional(),
  pageToken: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type GeeListAlgorithmsParams = z.infer<typeof GeeListAlgorithmsParamsSchema>

export const geeListAlgorithmsToolDefinition = {
  description:
    'Lists available Google Earth Engine algorithms from the configured Earth Engine project and service account.',
  inputSchema: GeeListAlgorithmsParamsSchema
}
