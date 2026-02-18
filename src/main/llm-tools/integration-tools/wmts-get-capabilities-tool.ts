import { z } from 'zod'

export const wmtsGetCapabilitiesToolName = 'wmts_get_capabilities'

export const WmtsGetCapabilitiesParamsSchema = z.object({
  version: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type WmtsGetCapabilitiesParams = z.infer<typeof WmtsGetCapabilitiesParamsSchema>

export const wmtsGetCapabilitiesToolDefinition = {
  description:
    'Fetches and summarizes WMTS GetCapabilities from the configured WMTS connector, including discovered layer identifiers.',
  inputSchema: WmtsGetCapabilitiesParamsSchema
}
