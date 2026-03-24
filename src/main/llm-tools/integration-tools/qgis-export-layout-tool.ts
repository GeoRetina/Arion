import { z } from 'zod'
import { qgisLayoutFormatSchema, qgisTimeoutMsSchema } from './qgis-tool-common'

export const qgisExportLayoutToolName = 'qgis_export_layout'

export const QgisExportLayoutParamsSchema = z.object({
  projectPath: z.string().trim().min(1),
  layoutName: z.string().trim().min(1),
  outputPath: z.string().trim().min(1).optional(),
  format: qgisLayoutFormatSchema,
  dpi: z.number().int().min(1).max(1200).optional(),
  georeference: z.boolean().optional(),
  includeMetadata: z.boolean().optional(),
  antialias: z.boolean().optional(),
  forceVector: z.boolean().optional(),
  forceRaster: z.boolean().optional(),
  timeoutMs: qgisTimeoutMsSchema
})

export type QgisExportLayoutParams = z.infer<typeof QgisExportLayoutParamsSchema>

export const qgisExportLayoutToolDefinition = {
  description:
    'Exports a QGIS print layout to PDF or image output using the configured local QGIS installation.',
  inputSchema: QgisExportLayoutParamsSchema
}
