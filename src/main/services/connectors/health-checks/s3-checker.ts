import type {
  IntegrationHealthCheckResult,
  S3IntegrationConfig
} from '../../../../shared/ipc-types'
import { fetchWithTimeout, normalizeTimeout } from './http-utils'
import { createHealthCheckResult } from './result'
import { buildS3RequestUrl, createSignedS3Headers, parseS3XmlError } from '../s3-signing'

export const checkS3 = async (
  config: S3IntegrationConfig
): Promise<IntegrationHealthCheckResult> => {
  const timeout = normalizeTimeout(config.timeoutMs)
  const requestUrl = buildS3RequestUrl(config)
  const headers = createSignedS3Headers(requestUrl, config)
  const response = await fetchWithTimeout(
    requestUrl.toString(),
    { method: 'GET', headers },
    timeout
  )

  if (response.ok) {
    return createHealthCheckResult(true, 'connected', `S3 bucket reachable: ${config.bucket}`, {
      bucket: config.bucket,
      region: config.region,
      endpoint: requestUrl.origin
    })
  }

  const body = await response.text()
  const xmlError = parseS3XmlError(body)
  const baseMessage = `S3 check failed with HTTP ${response.status} ${response.statusText}`
  return createHealthCheckResult(
    false,
    'error',
    xmlError ? `${baseMessage} (${xmlError})` : baseMessage
  )
}
