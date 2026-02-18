import { z } from 'zod'
import {
  SUPPORTED_INTEGRATION_IDS,
  type IntegrationConfig,
  type IntegrationConfigMap,
  type IntegrationId,
  type PostgreSQLConfig,
  type S3IntegrationConfig,
  type StacIntegrationConfig,
  type CogIntegrationConfig,
  type PmtilesIntegrationConfig,
  type WmsIntegrationConfig,
  type WmtsIntegrationConfig,
  type GoogleEarthEngineIntegrationConfig
} from '../../../shared/ipc-types'
import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from './constants'

const integrationIdSchema = z.enum(SUPPORTED_INTEGRATION_IDS)

const toTrimmedString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value
  }
  return value.trim()
}

const toNumber = (value: unknown): unknown => {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return Number(value.trim())
  }
  return value
}

const toBoolean = (value: unknown): unknown => {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return value
}

const timeoutSchema = z
  .preprocess(toNumber, z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS))
  .optional()

const httpUrlSchema = z
  .preprocess(toTrimmedString, z.string().url())
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'URL must start with http:// or https://'
  )

const postgresqlConfigSchema = z.object({
  host: z.preprocess(toTrimmedString, z.string().min(1)),
  port: z.preprocess(toNumber, z.number().int().min(1).max(65535)),
  database: z.preprocess(toTrimmedString, z.string().min(1)),
  username: z.preprocess(toTrimmedString, z.string().min(1)),
  password: z.preprocess(toTrimmedString, z.string().min(1)),
  ssl: z.preprocess(toBoolean, z.boolean())
})

const stacConfigSchema = z.object({
  baseUrl: httpUrlSchema,
  timeoutMs: timeoutSchema
})

const cogConfigSchema = z.object({
  url: httpUrlSchema,
  timeoutMs: timeoutSchema
})

const pmtilesConfigSchema = z.object({
  url: httpUrlSchema,
  timeoutMs: timeoutSchema
})

const wmsConfigSchema = z.object({
  baseUrl: httpUrlSchema,
  version: z.enum(['1.1.1', '1.3.0']).optional(),
  timeoutMs: timeoutSchema
})

const wmtsConfigSchema = z.object({
  baseUrl: httpUrlSchema,
  version: z.preprocess(toTrimmedString, z.string().min(1)).optional(),
  timeoutMs: timeoutSchema
})

const s3ConfigSchema = z.object({
  bucket: z.preprocess(toTrimmedString, z.string().min(3)),
  region: z.preprocess(toTrimmedString, z.string().min(2)),
  endpoint: httpUrlSchema.optional(),
  accessKeyId: z.preprocess(toTrimmedString, z.string().min(2)),
  secretAccessKey: z.preprocess(toTrimmedString, z.string().min(2)),
  sessionToken: z.preprocess(toTrimmedString, z.string().min(2)).optional(),
  forcePathStyle: z.preprocess(toBoolean, z.boolean()).optional(),
  timeoutMs: timeoutSchema
})

const googleEarthEngineConfigSchema = z.object({
  projectId: z.preprocess(toTrimmedString, z.string().min(2)),
  serviceAccountJson: z.preprocess(toTrimmedString, z.string().min(2)),
  timeoutMs: timeoutSchema
})

const integrationConfigSchemas = {
  'postgresql-postgis': postgresqlConfigSchema,
  stac: stacConfigSchema,
  cog: cogConfigSchema,
  pmtiles: pmtilesConfigSchema,
  wms: wmsConfigSchema,
  wmts: wmtsConfigSchema,
  s3: s3ConfigSchema,
  'google-earth-engine': googleEarthEngineConfigSchema
} satisfies { [K in IntegrationId]: z.ZodType<IntegrationConfigMap[K], z.ZodTypeDef, unknown> }

const secretKeysByIntegration: Record<IntegrationId, Set<string>> = {
  'postgresql-postgis': new Set(['password']),
  stac: new Set(),
  cog: new Set(),
  pmtiles: new Set(),
  wms: new Set(),
  wmts: new Set(),
  s3: new Set(['accessKeyId', 'secretAccessKey', 'sessionToken']),
  'google-earth-engine': new Set(['serviceAccountJson'])
}

export const validateIntegrationId = (rawId: string): IntegrationId =>
  integrationIdSchema.parse(rawId)

export const validateIntegrationConfig = (
  id: IntegrationId,
  config: unknown
): IntegrationConfig => {
  const schema = integrationConfigSchemas[id]
  return schema.parse(config) as IntegrationConfig
}

export const splitPublicAndSecretConfig = (
  id: IntegrationId,
  config: Record<string, unknown>
): { publicConfig: Record<string, unknown>; secretConfig: Record<string, unknown> } => {
  const secretKeys = secretKeysByIntegration[id]
  const publicConfig: Record<string, unknown> = {}
  const secretConfig: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(config)) {
    if (secretKeys.has(key)) {
      secretConfig[key] = value
    } else {
      publicConfig[key] = value
    }
  }

  return { publicConfig, secretConfig }
}

// Exported to make narrowing explicit at call sites.
export type {
  PostgreSQLConfig,
  StacIntegrationConfig,
  CogIntegrationConfig,
  PmtilesIntegrationConfig,
  WmsIntegrationConfig,
  WmtsIntegrationConfig,
  S3IntegrationConfig,
  GoogleEarthEngineIntegrationConfig
}
