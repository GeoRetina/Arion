import { z } from 'zod'

export const cogInspectMetadataToolName = 'cog_inspect_metadata'

export const CogInspectMetadataParamsSchema = z.object({
  headerBytes: z.number().int().min(16).max(65536).optional(),
  includeHeaderHex: z.boolean().optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type CogInspectMetadataParams = z.infer<typeof CogInspectMetadataParamsSchema>

export const cogInspectMetadataToolDefinition = {
  description:
    'Inspects the configured COG/TIFF archive header and returns transport metadata, byte-order details, and TIFF structural hints.',
  inputSchema: CogInspectMetadataParamsSchema
}
