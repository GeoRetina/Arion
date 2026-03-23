import { z } from 'zod'
import { qgisTimeoutMsSchema } from './qgis-tool-common'

export const qgisApplyLayerStyleToolName = 'qgis_apply_layer_style'

export const QgisApplyLayerStyleParamsSchema = z.object({
  inputPath: z.string().trim().min(1),
  stylePath: z.string().trim().min(1),
  timeoutMs: qgisTimeoutMsSchema
})

export type QgisApplyLayerStyleParams = z.infer<typeof QgisApplyLayerStyleParamsSchema>

export const qgisApplyLayerStyleToolDefinition = {
  description:
    'Applies an existing local QGIS style file to a local dataset through the configured QGIS installation. Use this when you already have a .qml or .sld file; it does not directly restyle the live Arion map layer.',
  inputSchema: QgisApplyLayerStyleParamsSchema
}
