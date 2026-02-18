import { z } from 'zod'

export const wmsGetCapabilitiesToolName = 'wms_get_capabilities'

export const WmsGetCapabilitiesParamsSchema = z.object({
  version: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
})

export type WmsGetCapabilitiesParams = z.infer<typeof WmsGetCapabilitiesParamsSchema>

export const wmsGetCapabilitiesToolDefinition = {
  description:
    'Fetches and summarizes WMS GetCapabilities from the configured WMS connector, including discovered layer names.',
  inputSchema: WmsGetCapabilitiesParamsSchema
}
