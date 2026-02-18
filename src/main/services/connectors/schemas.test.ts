import { describe, expect, it } from 'vitest'
import type { IntegrationId } from '../../../shared/ipc-types'
import { splitPublicAndSecretConfig, validateIntegrationConfig } from './schemas'

const serviceAccountJson = JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
})

const validConfigs: Record<IntegrationId, Record<string, unknown>> = {
  'postgresql-postgis': {
    host: 'localhost',
    port: 5432,
    database: 'gis',
    username: 'postgres',
    password: 'secret',
    ssl: false
  },
  stac: {
    baseUrl: 'https://example.com/stac',
    timeoutMs: 10000
  },
  cog: {
    url: 'https://example.com/raster.tif',
    timeoutMs: 10000
  },
  pmtiles: {
    url: 'https://example.com/map.pmtiles',
    timeoutMs: 10000
  },
  wms: {
    baseUrl: 'https://example.com/wms',
    version: '1.3.0',
    timeoutMs: 10000
  },
  wmts: {
    baseUrl: 'https://example.com/wmts',
    version: '1.0.0',
    timeoutMs: 10000
  },
  s3: {
    bucket: 'my-geospatial-bucket',
    region: 'us-east-1',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    accessKeyId: 'AKIAXXXX',
    secretAccessKey: 'SECRET',
    timeoutMs: 10000
  },
  'google-earth-engine': {
    projectId: 'my-project',
    serviceAccountJson,
    timeoutMs: 10000
  }
}

describe('integration schemas', () => {
  it('accepts valid configs for every integration', () => {
    for (const [id, config] of Object.entries(validConfigs) as [
      IntegrationId,
      Record<string, unknown>
    ][]) {
      expect(validateIntegrationConfig(id, config)).toBeTruthy()
    }
  })

  it('rejects missing required fields for each integration', () => {
    const requiredFields: Array<{ id: IntegrationId; field: string }> = [
      { id: 'postgresql-postgis', field: 'host' },
      { id: 'postgresql-postgis', field: 'database' },
      { id: 'postgresql-postgis', field: 'username' },
      { id: 'postgresql-postgis', field: 'password' },
      { id: 'stac', field: 'baseUrl' },
      { id: 'cog', field: 'url' },
      { id: 'pmtiles', field: 'url' },
      { id: 'wms', field: 'baseUrl' },
      { id: 'wmts', field: 'baseUrl' },
      { id: 's3', field: 'bucket' },
      { id: 's3', field: 'region' },
      { id: 's3', field: 'accessKeyId' },
      { id: 's3', field: 'secretAccessKey' },
      { id: 'google-earth-engine', field: 'projectId' },
      { id: 'google-earth-engine', field: 'serviceAccountJson' }
    ]

    for (const { id, field } of requiredFields) {
      const config = { ...validConfigs[id] }
      delete config[field]

      expect(() => validateIntegrationConfig(id, config)).toThrowError()
    }
  })

  it('rejects non-http(s) endpoints where applicable', () => {
    expect(() =>
      validateIntegrationConfig('stac', {
        baseUrl: 'ftp://example.com/stac'
      })
    ).toThrowError()

    expect(() =>
      validateIntegrationConfig('s3', {
        ...validConfigs.s3,
        endpoint: 'ftp://s3.us-east-1.amazonaws.com'
      })
    ).toThrowError()
  })

  it('stores only configured secret fields per integration', () => {
    const postgresqlSplit = splitPublicAndSecretConfig('postgresql-postgis', {
      ...validConfigs['postgresql-postgis']
    })
    expect(postgresqlSplit.secretConfig).toEqual({ password: 'secret' })
    expect(postgresqlSplit.publicConfig).not.toHaveProperty('password')

    const s3Split = splitPublicAndSecretConfig('s3', {
      ...validConfigs.s3,
      sessionToken: 'SESSION'
    })
    expect(s3Split.secretConfig).toEqual({
      accessKeyId: 'AKIAXXXX',
      secretAccessKey: 'SECRET',
      sessionToken: 'SESSION'
    })
    expect(s3Split.publicConfig).not.toHaveProperty('accessKeyId')
    expect(s3Split.publicConfig).not.toHaveProperty('secretAccessKey')
    expect(s3Split.publicConfig).not.toHaveProperty('sessionToken')

    const geeSplit = splitPublicAndSecretConfig('google-earth-engine', {
      ...validConfigs['google-earth-engine']
    })
    expect(geeSplit.secretConfig).toEqual({ serviceAccountJson })
    expect(geeSplit.publicConfig).not.toHaveProperty('serviceAccountJson')
  })
})
