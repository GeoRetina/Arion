import { z } from 'zod'

export const qgisTimeoutMsSchema = z.number().int().min(1000).max(30000).optional()
export const qgisAlgorithmIdSchema = z.string().trim().min(3)
export const qgisImportPreferenceSchema = z.enum(['none', 'suggest', 'auto']).optional()
export const qgisLayoutFormatSchema = z.enum(['pdf', 'image']).optional()
