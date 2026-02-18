import type {
  CogIntegrationConfig,
  GoogleEarthEngineIntegrationConfig,
  IntegrationHealthCheckResult,
  PmtilesIntegrationConfig,
  StacIntegrationConfig,
  WmsIntegrationConfig,
  WmtsIntegrationConfig
} from '../../../../shared/ipc-types'
import {
  buildCapabilitiesUrl,
  fetchWithTimeout,
  isTiffHeader,
  normalizeTimeout
} from './http-utils'
import { getGoogleEarthEngineAccessToken } from './gee-auth'
import { createHealthCheckResult } from './result'
import { isRecord } from '../utils'

const hasServiceException = (body: string): boolean => {
  return /<\s*(ServiceExceptionReport|ExceptionReport|ows:ExceptionReport)\b/i.test(body)
}

const STAC_LINK_RELS = new Set([
  'root',
  'child',
  'item',
  'items',
  'parent',
  'collection',
  'collections',
  'search'
])

const getNestedString = (record: Record<string, unknown>, path: string[]): string | undefined => {
  let current: unknown = record

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }

  return typeof current === 'string' && current.trim().length > 0 ? current.trim() : undefined
}

const buildEarthEngineAlgorithmsUrl = (
  discoveryPayload: Record<string, unknown>,
  projectId: string
): URL => {
  const rootUrl =
    typeof discoveryPayload.rootUrl === 'string' && discoveryPayload.rootUrl.trim().length > 0
      ? discoveryPayload.rootUrl
      : 'https://earthengine.googleapis.com/'

  const pathTemplate =
    getNestedString(discoveryPayload, [
      'resources',
      'projects',
      'resources',
      'algorithms',
      'methods',
      'list',
      'path'
    ]) || 'v1/projects/{+project}/algorithms'

  const projectPath = `projects/${projectId}`
  const resolvedPath = pathTemplate
    .replace('{+project}', projectPath)
    .replace('{project}', projectPath)
    .replace('{projectId}', projectId)

  return new URL(resolvedPath, rootUrl)
}

const parseGoogleApiErrorMessage = async (response: Response): Promise<string> => {
  const rawBody = await response.text()
  if (rawBody.trim().length === 0) {
    return 'No response body'
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown
    if (isRecord(parsed) && isRecord(parsed.error)) {
      const apiError = parsed.error
      const message = typeof apiError.message === 'string' ? apiError.message.trim() : ''
      const status = typeof apiError.status === 'string' ? apiError.status.trim() : ''
      if (message && status) return `${status}: ${message}`
      if (message) return message
      if (status) return status
    }
  } catch {
    // Fall through to raw body snippet.
  }

  return rawBody.trim().slice(0, 300)
}

export const checkStac = async (
  config: StacIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const timeout = normalizeTimeout(config.timeoutMs)
  const response = await fetchWithTimeout(
    config.baseUrl,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    },
    timeout
  )

  if (!response.ok) {
    return createHealthCheckResult(
      false,
      'error',
      `STAC endpoint returned HTTP ${response.status} ${response.statusText}`
    )
  }

  const payload = (await response.json()) as unknown
  if (!isRecord(payload)) {
    return createHealthCheckResult(
      false,
      'error',
      'Endpoint response does not appear to be a STAC catalog or API root'
    )
  }

  const normalizedType = typeof payload.type === 'string' ? payload.type.toLowerCase() : ''
  const hasStacLinks =
    Array.isArray(payload.links) &&
    payload.links.some((link) => {
      if (!isRecord(link)) return false
      const rel = typeof link.rel === 'string' ? link.rel.trim().toLowerCase() : ''
      const href = typeof link.href === 'string' ? link.href.trim() : ''
      return STAC_LINK_RELS.has(rel) && href.length > 0
    })
  const hasStacConformance =
    Array.isArray(payload.conformsTo) &&
    payload.conformsTo.some((value) => {
      return (
        typeof value === 'string' && (value.includes('stacspec.org') || value.includes('/stac/'))
      )
    })
  const stacVersion =
    typeof payload.stac_version === 'string' ? payload.stac_version : 'unknown version'
  const hasStacShape =
    typeof payload.stac_version === 'string' ||
    normalizedType === 'catalog' ||
    normalizedType === 'collection' ||
    hasStacLinks ||
    hasStacConformance

  if (!hasStacShape) {
    return createHealthCheckResult(
      false,
      'error',
      'Endpoint response does not appear to be a STAC catalog or API root'
    )
  }

  return createHealthCheckResult(true, 'connected', `STAC endpoint reachable (${stacVersion})`, {
    stacVersion
  })
}

export const checkCog = async (
  config: CogIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const timeout = normalizeTimeout(config.timeoutMs)
  const headResponse = await fetchWithTimeout(config.url, { method: 'HEAD' }, timeout)

  if (!headResponse.ok && headResponse.status !== 405) {
    return createHealthCheckResult(
      false,
      'error',
      `COG endpoint returned HTTP ${headResponse.status} ${headResponse.statusText}`
    )
  }

  const rangeResponse = await fetchWithTimeout(
    config.url,
    {
      method: 'GET',
      headers: {
        Range: 'bytes=0-15'
      }
    },
    timeout
  )

  if (!rangeResponse.ok) {
    return createHealthCheckResult(
      false,
      'error',
      `Failed to read COG header (HTTP ${rangeResponse.status} ${rangeResponse.statusText})`
    )
  }

  const contentBytes = new Uint8Array(await rangeResponse.arrayBuffer())
  if (!isTiffHeader(contentBytes)) {
    return createHealthCheckResult(
      false,
      'error',
      'Remote file is reachable but does not look like a TIFF/COG'
    )
  }

  return createHealthCheckResult(
    true,
    'connected',
    'COG URL is reachable and has a valid TIFF header'
  )
}

export const checkPmtiles = async (
  config: PmtilesIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const timeout = normalizeTimeout(config.timeoutMs)
  const headResponse = await fetchWithTimeout(config.url, { method: 'HEAD' }, timeout)

  if (!headResponse.ok && headResponse.status !== 405) {
    return createHealthCheckResult(
      false,
      'error',
      `PMTiles endpoint returned HTTP ${headResponse.status} ${headResponse.statusText}`
    )
  }

  const rangeResponse = await fetchWithTimeout(
    config.url,
    {
      method: 'GET',
      headers: {
        Range: 'bytes=0-7'
      }
    },
    timeout
  )

  if (!rangeResponse.ok) {
    return createHealthCheckResult(
      false,
      'error',
      `Failed to read PMTiles header (HTTP ${rangeResponse.status} ${rangeResponse.statusText})`
    )
  }

  const contentBytes = new Uint8Array(await rangeResponse.arrayBuffer())
  const headerText = new TextDecoder().decode(contentBytes)
  const isPmTilesMagic = headerText.startsWith('PMTiles')
  if (!isPmTilesMagic) {
    return createHealthCheckResult(
      false,
      'error',
      'Remote file is reachable but not a PMTiles archive'
    )
  }

  return createHealthCheckResult(
    true,
    'connected',
    'PMTiles URL is reachable and has a valid header'
  )
}

export const checkWms = async (
  config: WmsIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const version = config.version || '1.3.0'
  const timeout = normalizeTimeout(config.timeoutMs)
  const capabilitiesUrl = buildCapabilitiesUrl(config.baseUrl, 'WMS', version)
  const response = await fetchWithTimeout(capabilitiesUrl, { method: 'GET' }, timeout)

  if (!response.ok) {
    return createHealthCheckResult(
      false,
      'error',
      `WMS GetCapabilities returned HTTP ${response.status} ${response.statusText}`,
      { capabilitiesUrl }
    )
  }

  const body = await response.text()
  if (hasServiceException(body)) {
    return createHealthCheckResult(
      false,
      'error',
      'WMS endpoint returned a service exception document',
      { capabilitiesUrl }
    )
  }

  const hasWmsCapabilities =
    body.includes('<WMS_Capabilities') || body.includes('<WMT_MS_Capabilities')
  if (!hasWmsCapabilities) {
    return createHealthCheckResult(
      false,
      'error',
      'WMS GetCapabilities response did not include a valid capabilities document',
      { capabilitiesUrl }
    )
  }

  return createHealthCheckResult(true, 'connected', `WMS capabilities resolved (${version})`, {
    capabilitiesUrl,
    version
  })
}

export const checkWmts = async (
  config: WmtsIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const version = config.version || '1.0.0'
  const timeout = normalizeTimeout(config.timeoutMs)
  const capabilitiesUrl = buildCapabilitiesUrl(config.baseUrl, 'WMTS', version)
  const response = await fetchWithTimeout(capabilitiesUrl, { method: 'GET' }, timeout)

  if (!response.ok) {
    return createHealthCheckResult(
      false,
      'error',
      `WMTS GetCapabilities returned HTTP ${response.status} ${response.statusText}`,
      { capabilitiesUrl }
    )
  }

  const body = await response.text()
  if (hasServiceException(body)) {
    return createHealthCheckResult(
      false,
      'error',
      'WMTS endpoint returned a service exception document',
      { capabilitiesUrl }
    )
  }

  const hasWmtsCapabilities =
    body.includes('<Capabilities') &&
    (body.includes('wmts') || body.includes('WMTS') || body.includes('ows:OperationsMetadata'))

  if (!hasWmtsCapabilities) {
    return createHealthCheckResult(
      false,
      'error',
      'WMTS GetCapabilities response did not include a valid capabilities document',
      { capabilitiesUrl }
    )
  }

  return createHealthCheckResult(true, 'connected', `WMTS capabilities resolved (${version})`, {
    capabilitiesUrl,
    version
  })
}

export const checkGoogleEarthEngine = async (
  config: GoogleEarthEngineIntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  if (!config.serviceAccountJson || config.serviceAccountJson.trim().length === 0) {
    return createHealthCheckResult(
      false,
      'error',
      'Google Earth Engine requires a service account JSON credential'
    )
  }

  const timeout = normalizeTimeout(config.timeoutMs)
  const discoveryUrl = new URL('https://earthengine.googleapis.com/$discovery/rest')
  discoveryUrl.searchParams.set('version', 'v1')

  const response = await fetchWithTimeout(discoveryUrl.toString(), { method: 'GET' }, timeout)
  if (!response.ok) {
    return createHealthCheckResult(
      false,
      'error',
      `Earth Engine discovery endpoint returned HTTP ${response.status} ${response.statusText}`
    )
  }

  const payload = (await response.json()) as unknown
  if (!isRecord(payload)) {
    return createHealthCheckResult(
      false,
      'error',
      'Earth Engine discovery payload was not recognized'
    )
  }

  const hasExpectedFields =
    typeof payload.discoveryVersion === 'string' || typeof payload.baseUrl === 'string'
  if (!hasExpectedFields) {
    return createHealthCheckResult(
      false,
      'error',
      'Earth Engine discovery payload was not recognized'
    )
  }

  const algorithmsUrl = buildEarthEngineAlgorithmsUrl(payload, config.projectId)
  algorithmsUrl.searchParams.set('pageSize', '1')

  const headers: Record<string, string> = {}

  try {
    const accessToken = await getGoogleEarthEngineAccessToken(config.serviceAccountJson, timeout)
    headers.Authorization = `Bearer ${accessToken}`
    headers['X-Goog-User-Project'] = config.projectId
  } catch (error) {
    return createHealthCheckResult(
      false,
      'error',
      error instanceof Error ? error.message : 'Failed to authenticate with service account'
    )
  }

  const projectCheckResponse = await fetchWithTimeout(
    algorithmsUrl.toString(),
    {
      method: 'GET',
      headers
    },
    timeout
  )

  if (!projectCheckResponse.ok) {
    const details = await parseGoogleApiErrorMessage(projectCheckResponse)
    return createHealthCheckResult(
      false,
      'error',
      `Earth Engine project access check failed for "${config.projectId}" (HTTP ${projectCheckResponse.status} ${projectCheckResponse.statusText}): ${details}`
    )
  }

  return createHealthCheckResult(
    true,
    'connected',
    `Google Earth Engine authenticated for project "${config.projectId}" via service account`,
    {
      projectId: config.projectId
    }
  )
}
