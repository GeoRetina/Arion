const DEFAULT_ALLOWED_PROVIDERS = new Set<string>(['native', 'gdal'])
const DEFAULT_ALLOWED_GDAL_ALGORITHMS = new Set<string>(['gdal:translate', 'gdal:warpreproject'])

const DEFAULT_PROVIDER_ERROR = 'DISALLOWED_PROVIDER'
const DEFAULT_ALGORITHM_ERROR = 'UNSUPPORTED_ALGORITHM'

export interface QgisAlgorithmApprovalDecision {
  allowed: boolean
  errorCode?: 'DISALLOWED_PROVIDER' | 'UNSUPPORTED_ALGORITHM'
  message?: string
  providerId?: string
}

export function getQgisAlgorithmProviderId(algorithmId: string): string | null {
  const separatorIndex = algorithmId.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }

  return algorithmId.slice(0, separatorIndex).trim().toLowerCase() || null
}

export function evaluateQgisAlgorithmApproval(
  algorithmId: string,
  options: { allowPluginAlgorithms?: boolean } = {}
): QgisAlgorithmApprovalDecision {
  const normalizedAlgorithmId = algorithmId.trim().toLowerCase()
  const providerId = getQgisAlgorithmProviderId(normalizedAlgorithmId)

  if (!providerId) {
    return {
      allowed: false,
      errorCode: DEFAULT_ALGORITHM_ERROR,
      message: `Unsupported QGIS algorithm id "${algorithmId}". Expected "provider:algorithm".`
    }
  }

  if (providerId === 'native') {
    return {
      allowed: true,
      providerId
    }
  }

  if (providerId === 'gdal' && DEFAULT_ALLOWED_GDAL_ALGORITHMS.has(normalizedAlgorithmId)) {
    return {
      allowed: true,
      providerId
    }
  }

  if (!DEFAULT_ALLOWED_PROVIDERS.has(providerId) && options.allowPluginAlgorithms !== true) {
    return {
      allowed: false,
      errorCode: DEFAULT_PROVIDER_ERROR,
      providerId,
      message: `Provider "${providerId}" is not allowed by the current QGIS policy.`
    }
  }

  return {
    allowed: false,
    errorCode: DEFAULT_ALGORITHM_ERROR,
    providerId,
    message: `Algorithm "${algorithmId}" is not approved for QGIS processing in this release.`
  }
}

export function isQgisAlgorithmApproved(
  algorithmId: string,
  options: { allowPluginAlgorithms?: boolean } = {}
): boolean {
  return evaluateQgisAlgorithmApproval(algorithmId, options).allowed
}
