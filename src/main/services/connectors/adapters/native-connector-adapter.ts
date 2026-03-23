import type {
  CogIntegrationConfig,
  ConnectorCapability,
  GoogleEarthEngineIntegrationConfig,
  IntegrationId,
  PmtilesIntegrationConfig,
  PostgreSQLConfig,
  S3IntegrationConfig,
  StacIntegrationConfig,
  WmsIntegrationConfig,
  WmtsIntegrationConfig
} from '../../../../shared/ipc-types'
import type { ConnectorHubService } from '../../connector-hub-service'
import type { PostgreSQLService } from '../../postgresql-service'
import type { QgisProcessService } from '../../qgis/qgis-process-service'
import { getGoogleEarthEngineAccessToken } from '../health-checks/gee-auth'
import {
  buildCapabilitiesUrl,
  fetchWithTimeout,
  isTiffHeader,
  normalizeTimeout
} from '../health-checks/http-utils'
import { buildS3RequestUrl, createSignedS3Headers, parseS3XmlError } from '../s3-signing'
import { isRecord } from '../utils'
import type {
  ConnectorAdapter,
  ConnectorAdapterResult,
  ConnectorExecutionContext,
  ConnectorExecutionRequest
} from './connector-adapter'
import { buildConnectorError } from './connector-adapter'
import { parsePmtilesHeaderDetails, parseTiffHeaderDetails } from './native/archive-parsers'
import { encodeHeaderHex, parsePositiveInteger, readString } from './native/common'
import { buildEarthEngineAlgorithmsUrl, parseGoogleApiErrorMessage } from './native/earth-engine'
import { probeRemoteHeader } from './native/header-probe'
import { isReadOnlyQuery } from './native/sql-safety'
import { parseS3ObjectList, parseWmsLayerNames, parseWmtsLayerNames } from './native/xml'

const capabilityKey = (integrationId: IntegrationId, capability: ConnectorCapability): string =>
  `${integrationId}:${capability}`

type NativeCapabilityExecutor = (
  input: Record<string, unknown>,
  timeoutMs: number
) => Promise<ConnectorAdapterResult>

export class NativeConnectorAdapter implements ConnectorAdapter {
  public readonly id = 'native-connector-adapter'
  public readonly backend = 'native' as const

  private readonly handlers: Map<string, NativeCapabilityExecutor>

  constructor(
    private readonly connectorHubService: ConnectorHubService,
    private readonly postgresqlService: PostgreSQLService,
    private readonly qgisProcessService: QgisProcessService
  ) {
    this.handlers = new Map<string, NativeCapabilityExecutor>([
      [
        capabilityKey('postgresql-postgis', 'sql.query'),
        (input) => this.executePostgresqlQuery(input)
      ],
      [
        capabilityKey('stac', 'catalog.search'),
        (input, timeoutMs) => this.executeStacSearch(input, timeoutMs)
      ],
      [
        capabilityKey('cog', 'raster.inspectMetadata'),
        (input, timeoutMs) => this.executeCogInspectMetadata(input, timeoutMs)
      ],
      [
        capabilityKey('wms', 'tiles.getCapabilities'),
        (input, timeoutMs) => this.executeWmsCapabilities(input, timeoutMs)
      ],
      [
        capabilityKey('pmtiles', 'tiles.inspectArchive'),
        (input, timeoutMs) => this.executePmtilesInspectArchive(input, timeoutMs)
      ],
      [
        capabilityKey('wmts', 'tiles.getCapabilities'),
        (input, timeoutMs) => this.executeWmtsCapabilities(input, timeoutMs)
      ],
      [
        capabilityKey('s3', 'storage.list'),
        (input, timeoutMs) => this.executeS3List(input, timeoutMs)
      ],
      [
        capabilityKey('google-earth-engine', 'gee.listAlgorithms'),
        (input, timeoutMs) => this.executeGEEListAlgorithms(input, timeoutMs)
      ],
      [
        capabilityKey('qgis', 'desktop.processing.listAlgorithms'),
        (input, timeoutMs) => this.executeQgisListAlgorithms(input, timeoutMs)
      ],
      [
        capabilityKey('qgis', 'desktop.processing.describeAlgorithm'),
        (input, timeoutMs) => this.executeQgisDescribeAlgorithm(input, timeoutMs)
      ],
      [
        capabilityKey('qgis', 'desktop.processing.run'),
        (input, timeoutMs) => this.executeQgisRunAlgorithm(input, timeoutMs)
      ],
      [
        capabilityKey('qgis', 'desktop.style.apply'),
        (input, timeoutMs) => this.executeQgisApplyStyle(input, timeoutMs)
      ],
      [
        capabilityKey('qgis', 'desktop.layout.export'),
        (input, timeoutMs) => this.executeQgisExportLayout(input, timeoutMs)
      ]
    ])
  }

  public supports(integrationId: IntegrationId, capability: ConnectorCapability): boolean {
    return this.handlers.has(capabilityKey(integrationId, capability))
  }

  public async execute(
    request: ConnectorExecutionRequest,
    context: ConnectorExecutionContext
  ): Promise<ConnectorAdapterResult> {
    const handler = this.handlers.get(capabilityKey(request.integrationId, request.capability))
    if (!handler) {
      return buildConnectorError(
        'UNSUPPORTED_CAPABILITY',
        `Native adapter does not support ${request.integrationId}/${request.capability}`
      )
    }

    return handler(
      {
        ...request.input,
        __chatId: request.chatId
      },
      context.timeoutMs
    )
  }

  private async executePostgresqlQuery(
    input: Record<string, unknown>
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig(
      'postgresql-postgis'
    )) as PostgreSQLConfig | null
    if (!config) {
      return buildConnectorError(
        'NOT_CONFIGURED',
        'PostgreSQL integration is not configured. Configure and connect it from Connectors.'
      )
    }

    const query = readString(input.query)
    if (!query) {
      return buildConnectorError('VALIDATION_FAILED', 'A SQL query string is required.')
    }

    if (input.readOnly === false) {
      return buildConnectorError(
        'VALIDATION_FAILED',
        'This capability is read-only. Remove readOnly=false to continue.'
      )
    }

    const queryValidation = isReadOnlyQuery(query)
    if (!queryValidation.valid) {
      return buildConnectorError(
        'VALIDATION_FAILED',
        queryValidation.message || 'Only read-only SQL queries are allowed by this capability.'
      )
    }

    const params = Array.isArray(input.params) ? input.params : undefined
    const rowLimitRaw = typeof input.rowLimit === 'number' ? input.rowLimit : 200
    const rowLimit = Math.max(1, Math.min(Math.floor(rowLimitRaw), 1000))

    const connectionInfo = await this.postgresqlService.getConnectionInfo('postgresql-postgis')
    if (!connectionInfo.connected) {
      return buildConnectorError(
        'NOT_CONFIGURED',
        'PostgreSQL integration is configured but not connected. Connect it from Connectors.'
      )
    }

    const result = await this.postgresqlService.executeQuery('postgresql-postgis', query, params)
    if (!result.success) {
      return buildConnectorError('EXECUTION_FAILED', result.message)
    }

    const rows = Array.isArray(result.rows) ? result.rows : []
    const truncated = rows.length > rowLimit
    const returnedRows = truncated ? rows.slice(0, rowLimit) : rows

    return {
      success: true,
      data: {
        rowCount: result.rowCount || rows.length,
        returnedRows: returnedRows.length,
        rows: returnedRows,
        fields: result.fields || [],
        executionTime: result.executionTime,
        truncated,
        message: result.message
      }
    }
  }

  private async executeStacSearch(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig(
      'stac'
    )) as StacIntegrationConfig | null
    if (!config) {
      return buildConnectorError('NOT_CONFIGURED', 'STAC integration is not configured.')
    }

    const searchUrl = new URL(config.baseUrl)
    if (!searchUrl.pathname.endsWith('/search')) {
      searchUrl.pathname = `${searchUrl.pathname.replace(/\/$/, '')}/search`
    }

    const requestedLimit = typeof input.limit === 'number' ? Math.floor(input.limit) : 25
    const limit = Math.max(1, Math.min(requestedLimit, 500))
    const payload: Record<string, unknown> = { limit }

    if (Array.isArray(input.collections)) {
      const collections = input.collections.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
      if (collections.length > 0) payload.collections = collections
    }
    if (Array.isArray(input.bbox) && input.bbox.length >= 4) {
      payload.bbox = input.bbox
    }
    if (typeof input.datetime === 'string' && input.datetime.trim().length > 0) {
      payload.datetime = input.datetime.trim()
    }
    if (isRecord(input.query)) {
      payload.query = input.query
    }
    if (isRecord(input.intersects)) {
      payload.intersects = input.intersects
    }

    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)
    const response = await fetchWithTimeout(
      searchUrl.toString(),
      {
        method: 'POST',
        headers: {
          Accept: 'application/geo+json, application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      },
      timeout
    )

    if (!response.ok) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `STAC search failed with HTTP ${response.status} ${response.statusText}`,
        { searchUrl: searchUrl.toString() },
        response.status >= 500
      )
    }

    const parsed = (await response.json()) as unknown
    if (!isRecord(parsed)) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        'STAC search response is not a valid JSON object.'
      )
    }

    const features = Array.isArray(parsed.features) ? parsed.features : []
    return {
      success: true,
      data: {
        matched: typeof parsed.matched === 'number' ? parsed.matched : undefined,
        returned: features.length,
        features,
        links: Array.isArray(parsed.links) ? parsed.links : []
      }
    }
  }

  private async executeCogInspectMetadata(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig('cog')) as CogIntegrationConfig | null
    if (!config) {
      return buildConnectorError('NOT_CONFIGURED', 'COG integration is not configured.')
    }

    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)
    const headerBytes = parsePositiveInteger(input.headerBytes, 4096, 16, 65536)
    const includeHeaderHex = input.includeHeaderHex === true

    const probeResult = await probeRemoteHeader(config.url, headerBytes, timeout)
    if (!probeResult.success) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `COG header read failed with HTTP ${probeResult.status} ${probeResult.statusText}`,
        {
          url: config.url
        },
        probeResult.status >= 500
      )
    }

    const { bytes } = probeResult
    if (!isTiffHeader(bytes)) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        'Remote file does not start with a recognized TIFF header.',
        {
          url: config.url
        }
      )
    }

    const parsedTiff = parseTiffHeaderDetails(bytes)
    if (!parsedTiff.valid) {
      return buildConnectorError('EXECUTION_FAILED', parsedTiff.reason, {
        url: config.url
      })
    }

    const payload: Record<string, unknown> = {
      url: config.url,
      transport: probeResult.transport,
      tiff: parsedTiff
    }

    if (probeResult.warnings.length > 0) {
      payload.warnings = probeResult.warnings
    }
    if (includeHeaderHex) {
      payload.headerHex = encodeHeaderHex(bytes, 128)
    }

    return {
      success: true,
      data: payload
    }
  }

  private async executePmtilesInspectArchive(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig(
      'pmtiles'
    )) as PmtilesIntegrationConfig | null
    if (!config) {
      return buildConnectorError('NOT_CONFIGURED', 'PMTiles integration is not configured.')
    }

    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)
    const headerBytes = parsePositiveInteger(input.headerBytes, 4096, 8, 65536)
    const includeHeaderHex = input.includeHeaderHex === true

    const probeResult = await probeRemoteHeader(config.url, headerBytes, timeout)
    if (!probeResult.success) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `PMTiles header read failed with HTTP ${probeResult.status} ${probeResult.statusText}`,
        {
          url: config.url
        },
        probeResult.status >= 500
      )
    }

    const parsedPmtiles = parsePmtilesHeaderDetails(probeResult.bytes)
    if (!parsedPmtiles.valid) {
      return buildConnectorError('EXECUTION_FAILED', parsedPmtiles.reason, {
        url: config.url
      })
    }

    const payload: Record<string, unknown> = {
      url: config.url,
      transport: probeResult.transport,
      pmtiles: parsedPmtiles
    }

    if (probeResult.warnings.length > 0) {
      payload.warnings = probeResult.warnings
    }
    if (includeHeaderHex) {
      payload.headerHex = encodeHeaderHex(probeResult.bytes, 128)
    }

    return {
      success: true,
      data: payload
    }
  }

  private async executeWmsCapabilities(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig('wms')) as WmsIntegrationConfig | null
    if (!config) {
      return buildConnectorError('NOT_CONFIGURED', 'WMS integration is not configured.')
    }

    const version = readString(input.version) || config.version || '1.3.0'
    const capabilitiesUrl = buildCapabilitiesUrl(config.baseUrl, 'WMS', version)
    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)

    const response = await fetchWithTimeout(capabilitiesUrl, { method: 'GET' }, timeout)
    if (!response.ok) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `WMS GetCapabilities failed with HTTP ${response.status} ${response.statusText}`,
        { capabilitiesUrl },
        response.status >= 500
      )
    }

    const body = await response.text()
    if (/ServiceException|ExceptionReport|ows:ExceptionReport/i.test(body)) {
      return buildConnectorError('EXECUTION_FAILED', 'WMS returned a service exception document.', {
        capabilitiesUrl
      })
    }

    const layerNames = parseWmsLayerNames(body)
    return {
      success: true,
      data: {
        version,
        capabilitiesUrl,
        layerCount: layerNames.length,
        sampleLayers: layerNames.slice(0, 25),
        xmlSnippet: body.slice(0, 4000)
      }
    }
  }

  private async executeWmtsCapabilities(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig(
      'wmts'
    )) as WmtsIntegrationConfig | null
    if (!config) {
      return buildConnectorError('NOT_CONFIGURED', 'WMTS integration is not configured.')
    }

    const version = readString(input.version) || config.version || '1.0.0'
    const capabilitiesUrl = buildCapabilitiesUrl(config.baseUrl, 'WMTS', version)
    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)

    const response = await fetchWithTimeout(capabilitiesUrl, { method: 'GET' }, timeout)
    if (!response.ok) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `WMTS GetCapabilities failed with HTTP ${response.status} ${response.statusText}`,
        { capabilitiesUrl },
        response.status >= 500
      )
    }

    const body = await response.text()
    if (/ServiceException|ExceptionReport|ows:ExceptionReport/i.test(body)) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        'WMTS returned a service exception document.',
        {
          capabilitiesUrl
        }
      )
    }

    const layerNames = parseWmtsLayerNames(body)
    return {
      success: true,
      data: {
        version,
        capabilitiesUrl,
        layerCount: layerNames.length,
        sampleLayers: layerNames.slice(0, 25),
        xmlSnippet: body.slice(0, 4000)
      }
    }
  }

  private async executeS3List(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig('s3')) as S3IntegrationConfig | null
    if (!config) {
      return buildConnectorError('NOT_CONFIGURED', 'S3 integration is not configured.')
    }

    const requestUrl = buildS3RequestUrl(config)
    const prefix = readString(input.prefix)
    if (prefix) {
      requestUrl.searchParams.set('prefix', prefix)
    }

    const requestedMaxKeys = typeof input.maxKeys === 'number' ? Math.floor(input.maxKeys) : 50
    const maxKeys = Math.max(1, Math.min(requestedMaxKeys, 1000))
    requestUrl.searchParams.set('max-keys', String(maxKeys))

    const headers = createSignedS3Headers(requestUrl, config)
    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)
    const response = await fetchWithTimeout(
      requestUrl.toString(),
      {
        method: 'GET',
        headers
      },
      timeout
    )

    if (!response.ok) {
      const body = await response.text()
      const xmlError = parseS3XmlError(body)
      return buildConnectorError(
        'EXECUTION_FAILED',
        xmlError
          ? `S3 list failed with HTTP ${response.status} ${response.statusText}: ${xmlError}`
          : `S3 list failed with HTTP ${response.status} ${response.statusText}`,
        {
          bucket: config.bucket,
          region: config.region
        },
        response.status >= 500
      )
    }

    const body = await response.text()
    const objects = parseS3ObjectList(body)
    const isTruncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(body)

    return {
      success: true,
      data: {
        bucket: config.bucket,
        region: config.region,
        prefix: prefix || undefined,
        objectCount: objects.length,
        isTruncated,
        objects
      }
    }
  }

  private async executeGEEListAlgorithms(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const config = (await this.connectorHubService.getConfig(
      'google-earth-engine'
    )) as GoogleEarthEngineIntegrationConfig | null
    if (!config) {
      return buildConnectorError(
        'NOT_CONFIGURED',
        'Google Earth Engine integration is not configured.'
      )
    }

    if (!config.serviceAccountJson || config.serviceAccountJson.trim().length === 0) {
      return buildConnectorError(
        'NOT_CONFIGURED',
        'Google Earth Engine requires a service account JSON credential.'
      )
    }

    const timeout = normalizeTimeout(timeoutMs || config.timeoutMs)
    const discoveryUrl = new URL('https://earthengine.googleapis.com/$discovery/rest')
    discoveryUrl.searchParams.set('version', 'v1')

    const discoveryResponse = await fetchWithTimeout(
      discoveryUrl.toString(),
      { method: 'GET' },
      timeout
    )
    if (!discoveryResponse.ok) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        `Earth Engine discovery failed with HTTP ${discoveryResponse.status} ${discoveryResponse.statusText}`,
        undefined,
        discoveryResponse.status >= 500
      )
    }

    const discoveryPayload = (await discoveryResponse.json()) as unknown
    if (!isRecord(discoveryPayload)) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        'Earth Engine discovery payload is not recognized.'
      )
    }

    let accessToken: string
    try {
      accessToken = await getGoogleEarthEngineAccessToken(config.serviceAccountJson, timeout)
    } catch (error) {
      return buildConnectorError(
        'EXECUTION_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to authenticate Earth Engine service account'
      )
    }

    const algorithmsUrl = buildEarthEngineAlgorithmsUrl(discoveryPayload, config.projectId)
    const pageSize = typeof input.pageSize === 'number' ? Math.floor(input.pageSize) : 25
    algorithmsUrl.searchParams.set('pageSize', String(Math.max(1, Math.min(pageSize, 100))))

    const pageToken = readString(input.pageToken)
    if (pageToken) {
      algorithmsUrl.searchParams.set('pageToken', pageToken)
    }

    const response = await fetchWithTimeout(
      algorithmsUrl.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Goog-User-Project': config.projectId
        }
      },
      timeout
    )

    if (!response.ok) {
      const details = await parseGoogleApiErrorMessage(response)
      return buildConnectorError(
        'EXECUTION_FAILED',
        `Earth Engine algorithms list failed for "${config.projectId}" (HTTP ${response.status} ${response.statusText}): ${details}`,
        undefined,
        response.status >= 500
      )
    }

    const payload = (await response.json()) as unknown
    if (!isRecord(payload)) {
      return buildConnectorError('EXECUTION_FAILED', 'Earth Engine algorithms response is invalid.')
    }

    return {
      success: true,
      data: {
        projectId: config.projectId,
        algorithms: Array.isArray(payload.algorithms) ? payload.algorithms : [],
        nextPageToken: typeof payload.nextPageToken === 'string' ? payload.nextPageToken : undefined
      }
    }
  }

  private async executeQgisListAlgorithms(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const parsedLimit =
      typeof input.limit === 'number'
        ? input.limit
        : typeof input.limit === 'string' && input.limit.trim().length > 0
          ? Number(input.limit.trim())
          : NaN
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(200, Math.max(1, Math.floor(parsedLimit)))
      : undefined

    const result = await this.qgisProcessService.listAlgorithms({
      query: readString(input.query) ?? undefined,
      provider: readString(input.provider) ?? undefined,
      limit,
      timeoutMs
    })
    return toQgisConnectorAdapterResult(result)
  }

  private async executeQgisDescribeAlgorithm(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const algorithmId = readString(input.algorithmId)
    if (!algorithmId) {
      return buildConnectorError('VALIDATION_FAILED', 'algorithmId is required.')
    }

    const result = await this.qgisProcessService.describeAlgorithm(algorithmId, { timeoutMs })
    return toQgisConnectorAdapterResult(result)
  }

  private async executeQgisRunAlgorithm(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const algorithmId = readString(input.algorithmId)
    if (!algorithmId) {
      return buildConnectorError('VALIDATION_FAILED', 'algorithmId is required.')
    }

    const parameters = isRecord(input.parameters) ? input.parameters : {}
    const expectedOutputs = Array.isArray(input.expectedOutputs)
      ? input.expectedOutputs.filter((value): value is string => typeof value === 'string')
      : undefined

    const result = await this.qgisProcessService.runAlgorithm({
      algorithmId,
      parameters,
      projectPath: readString(input.projectPath) ?? undefined,
      timeoutMs,
      importPreference: normalizeImportPreference(input.importPreference),
      expectedOutputs,
      chatId: readString(input.__chatId) ?? undefined
    })

    return toQgisConnectorAdapterResult(result)
  }

  private async executeQgisApplyStyle(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const inputPath = readString(input.inputPath)
    const stylePath = readString(input.stylePath)
    if (!inputPath || !stylePath) {
      return buildConnectorError(
        'VALIDATION_FAILED',
        'inputPath and stylePath are required for QGIS style application.'
      )
    }

    const result = await this.qgisProcessService.applyLayerStyle({
      inputPath,
      stylePath,
      timeoutMs,
      chatId: readString(input.__chatId) ?? undefined
    })

    return toQgisConnectorAdapterResult(result)
  }

  private async executeQgisExportLayout(
    input: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ConnectorAdapterResult> {
    const projectPath = readString(input.projectPath)
    const layoutName = readString(input.layoutName)
    if (!projectPath || !layoutName) {
      return buildConnectorError(
        'VALIDATION_FAILED',
        'projectPath and layoutName are required for QGIS layout export.'
      )
    }

    const result = await this.qgisProcessService.exportLayout({
      projectPath,
      layoutName,
      outputPath: readString(input.outputPath) ?? undefined,
      format: input.format === 'pdf' || input.format === 'image' ? input.format : undefined,
      dpi: typeof input.dpi === 'number' ? input.dpi : undefined,
      georeference: typeof input.georeference === 'boolean' ? input.georeference : undefined,
      includeMetadata:
        typeof input.includeMetadata === 'boolean' ? input.includeMetadata : undefined,
      antialias: typeof input.antialias === 'boolean' ? input.antialias : undefined,
      forceVector: typeof input.forceVector === 'boolean' ? input.forceVector : undefined,
      forceRaster: typeof input.forceRaster === 'boolean' ? input.forceRaster : undefined,
      timeoutMs,
      chatId: readString(input.__chatId) ?? undefined
    })

    return toQgisConnectorAdapterResult(result)
  }
}

function normalizeImportPreference(value: unknown): 'none' | 'suggest' | 'auto' | undefined {
  if (value === 'none' || value === 'suggest' || value === 'auto') {
    return value
  }

  return undefined
}

function toConnectorDetails(diagnostics?: unknown): Record<string, unknown> | undefined {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return undefined
  }

  return { ...diagnostics }
}

function toQgisConnectorAdapterResult(
  result: Awaited<ReturnType<QgisProcessService['listAlgorithms']>>
): ConnectorAdapterResult {
  if (!result.success) {
    return buildConnectorError(
      result.errorCode,
      result.message,
      toConnectorDetails(result.diagnostics),
      result.errorCode === 'TIMEOUT'
    )
  }

  return {
    success: true,
    data: {
      operation: result.operation,
      exitCode: result.exitCode,
      version: result.version,
      artifacts: result.artifacts,
      importedLayers: result.importedLayers.map((entry) => ({
        path: entry.path,
        layerName: entry.layer.name,
        layerType: entry.layer.type
      })),
      result: result.parsedResult
    },
    details: toConnectorDetails(result.diagnostics)
  }
}
