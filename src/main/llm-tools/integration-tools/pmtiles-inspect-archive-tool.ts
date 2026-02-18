import { z } from 'zod'

export const pmtilesInspectArchiveToolName = 'pmtiles_inspect_archive'

export const PmtilesInspectArchiveParamsSchema = z.object({
  headerBytes: z.number().int().min(8).max(65536).optional(),
  includeHeaderHex: z.boolean().optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type PmtilesInspectArchiveParams = z.infer<typeof PmtilesInspectArchiveParamsSchema>

export const pmtilesInspectArchiveToolDefinition = {
  description:
    'Inspects the configured PMTiles archive header and returns archive/version metadata, layout offsets, and bounds/center hints when available.',
  inputSchema: PmtilesInspectArchiveParamsSchema
}
