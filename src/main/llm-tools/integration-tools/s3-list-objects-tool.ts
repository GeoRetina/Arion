import { z } from 'zod'

export const s3ListObjectsToolName = 's3_list_objects'

export const S3ListObjectsParamsSchema = z.object({
  prefix: z.string().optional(),
  maxKeys: z.number().int().min(1).max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type S3ListObjectsParams = z.infer<typeof S3ListObjectsParamsSchema>

export const s3ListObjectsToolDefinition = {
  description:
    'Lists objects from the configured S3-compatible connector, with optional prefix filtering and key limits.',
  inputSchema: S3ListObjectsParamsSchema
}
