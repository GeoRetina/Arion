import type { IntegrationId } from '../../../../../shared/ipc-types'
import type { IntegrationDefinition, IntegrationType } from '../types/integration'

const createDefinition = (definition: IntegrationDefinition): IntegrationDefinition => definition

const apiType: IntegrationType = 'api'
const cloudType: IntegrationType = 'cloud'
const databaseType: IntegrationType = 'database'
const cloudPlatformType: IntegrationType = 'cloud-platform'

export const integrationRegistry: IntegrationDefinition[] = [
  createDefinition({
    integration: {
      id: 'postgresql-postgis',
      name: 'PostgreSQL/PostGIS',
      description: 'Connect to spatial databases for advanced GIS operations',
      type: databaseType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Database',
      configurable: true,
      documentation: 'https://postgis.net/docs/',
      connectionSettings: {
        host: 'localhost',
        port: 5432,
        database: '',
        username: '',
        password: '',
        ssl: false
      }
    }
  }),
  createDefinition({
    integration: {
      id: 'stac',
      name: 'STAC',
      description: 'Connect to SpatioTemporal Asset Catalog APIs and catalogs',
      type: apiType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Catalog',
      configurable: true,
      documentation: 'https://stacspec.org/'
    },
    defaultConnectionSettings: {
      baseUrl: '',
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'baseUrl',
        label: 'Base URL',
        type: 'url',
        required: true,
        placeholder: 'https://planetarycomputer.microsoft.com/api/stac/v1'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  }),
  createDefinition({
    integration: {
      id: 'cog',
      name: 'COG',
      description: 'Validate and connect Cloud Optimized GeoTIFF endpoints',
      type: cloudType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Raster',
      configurable: true,
      documentation: 'https://www.cogeo.org/'
    },
    defaultConnectionSettings: {
      url: '',
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'url',
        label: 'COG URL',
        type: 'url',
        required: true,
        placeholder: 'https://example.com/raster.tif'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  }),
  createDefinition({
    integration: {
      id: 'pmtiles',
      name: 'PMTiles',
      description: 'Connect vector tile archives over HTTP(S)',
      type: cloudType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Tiles',
      configurable: true,
      documentation: 'https://docs.protomaps.com/pmtiles/'
    },
    defaultConnectionSettings: {
      url: '',
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'url',
        label: 'PMTiles URL',
        type: 'url',
        required: true,
        placeholder: 'https://example.com/map.pmtiles'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  }),
  createDefinition({
    integration: {
      id: 'wms',
      name: 'WMS',
      description: 'Connect OGC Web Map Service endpoints',
      type: apiType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Tiles',
      configurable: true,
      documentation: 'https://www.ogc.org/standards/wms'
    },
    defaultConnectionSettings: {
      baseUrl: '',
      version: '1.3.0',
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'baseUrl',
        label: 'Service URL',
        type: 'url',
        required: true,
        placeholder: 'https://demo.mapserver.org/cgi-bin/wms'
      },
      {
        key: 'version',
        label: 'Version',
        type: 'text',
        placeholder: '1.3.0'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  }),
  createDefinition({
    integration: {
      id: 'wmts',
      name: 'WMTS',
      description: 'Connect OGC Web Map Tile Service endpoints',
      type: apiType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Tiles',
      configurable: true,
      documentation: 'https://www.ogc.org/standards/wmts/'
    },
    defaultConnectionSettings: {
      baseUrl: '',
      version: '1.0.0',
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'baseUrl',
        label: 'Service URL',
        type: 'url',
        required: true,
        placeholder: 'https://example.com/wmts'
      },
      {
        key: 'version',
        label: 'Version',
        type: 'text',
        placeholder: '1.0.0'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  }),
  createDefinition({
    integration: {
      id: 's3',
      name: 'S3',
      description: 'Connect to S3-compatible object storage for geospatial assets',
      type: cloudType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Storage',
      configurable: true,
      documentation: 'https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html'
    },
    defaultConnectionSettings: {
      bucket: '',
      region: 'us-east-1',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
      forcePathStyle: true,
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'bucket',
        label: 'Bucket',
        type: 'text',
        required: true,
        placeholder: 'my-geospatial-bucket'
      },
      {
        key: 'region',
        label: 'Region',
        type: 'text',
        required: true,
        placeholder: 'us-east-1'
      },
      {
        key: 'endpoint',
        label: 'Endpoint URL',
        type: 'url',
        placeholder: 'https://s3.us-east-1.amazonaws.com'
      },
      {
        key: 'accessKeyId',
        label: 'Access Key ID',
        type: 'text',
        sensitive: true,
        required: true,
        description: 'Stored credentials are not auto-filled. Enter to authenticate.'
      },
      {
        key: 'secretAccessKey',
        label: 'Secret Access Key',
        type: 'password',
        sensitive: true,
        required: true,
        description: 'Stored credentials are not auto-filled. Enter to authenticate.'
      },
      {
        key: 'sessionToken',
        label: 'Session Token',
        type: 'password',
        sensitive: true,
        description: 'Optional session token for temporary credentials.'
      },
      {
        key: 'forcePathStyle',
        label: 'Force Path Style',
        type: 'boolean',
        description: 'Enable for MinIO or S3-compatible endpoints that require path-style URLs.'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  }),
  createDefinition({
    integration: {
      id: 'google-earth-engine',
      name: 'Google Earth Engine',
      description: 'Access Earth Engine catalogs and processing APIs',
      type: cloudPlatformType,
      status: 'not-configured',
      lastUsed: 'Never',
      category: 'Cloud Platform',
      configurable: true,
      documentation: 'https://developers.google.com/earth-engine'
    },
    defaultConnectionSettings: {
      projectId: '',
      serviceAccountJson: '',
      timeoutMs: 10000
    },
    fields: [
      {
        key: 'projectId',
        label: 'Project ID',
        type: 'text',
        required: true,
        placeholder: 'my-gcp-project'
      },
      {
        key: 'serviceAccountJson',
        label: 'Service Account JSON',
        type: 'textarea',
        sensitive: true,
        required: true,
        description: 'Required. Stored secrets are not auto-filled.'
      },
      {
        key: 'timeoutMs',
        label: 'Timeout (ms)',
        type: 'number',
        placeholder: '10000'
      }
    ]
  })
]

export const getIntegrationById = (id: IntegrationId): IntegrationDefinition | undefined =>
  integrationRegistry.find((config) => config.integration.id === id)

export const getIntegrationsByType = (type: IntegrationType): IntegrationDefinition[] =>
  integrationRegistry.filter((config) => config.integration.type === type)

export const getIntegrationsByCategory = (category: string): IntegrationDefinition[] =>
  integrationRegistry.filter((config) => config.integration.category === category)

export default integrationRegistry
