import { fetchWithTimeout } from '../../health-checks/http-utils'
import { toHeaderNumber } from './common'

interface HeaderProbeTransport {
  headStatus?: number
  rangeStatus: number
  contentLength?: number
  contentType?: string
  acceptRanges?: string
  contentRange?: string
  requestedHeaderBytes: number
  receivedHeaderBytes: number
}

export type HeaderProbeResult =
  | {
      success: true
      bytes: Uint8Array
      transport: HeaderProbeTransport
      warnings: string[]
    }
  | {
      success: false
      status: number
      statusText: string
      warnings: string[]
    }

export const probeRemoteHeader = async (
  url: string,
  headerBytes: number,
  timeoutMs: number
): Promise<HeaderProbeResult> => {
  const warnings: string[] = []

  let headStatus: number | undefined
  let contentLength: number | undefined
  let contentType: string | undefined
  let acceptRanges: string | undefined

  try {
    const headResponse = await fetchWithTimeout(url, { method: 'HEAD' }, timeoutMs)
    headStatus = headResponse.status

    if (headResponse.ok || headResponse.status === 405) {
      contentLength = toHeaderNumber(headResponse.headers.get('content-length'))
      contentType = headResponse.headers.get('content-type') || undefined
      acceptRanges = headResponse.headers.get('accept-ranges') || undefined
    } else {
      warnings.push(`HEAD request returned HTTP ${headResponse.status} ${headResponse.statusText}`)
    }
  } catch (error) {
    warnings.push(
      `HEAD request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  const rangeResponse = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        Range: `bytes=0-${headerBytes - 1}`
      }
    },
    timeoutMs
  )

  if (!rangeResponse.ok) {
    return {
      success: false,
      status: rangeResponse.status,
      statusText: rangeResponse.statusText,
      warnings
    }
  }

  const bytes = new Uint8Array(await rangeResponse.arrayBuffer())
  const rangeContentLength = toHeaderNumber(rangeResponse.headers.get('content-length'))

  if (contentLength === undefined) {
    contentLength = rangeContentLength
  }
  if (!contentType) {
    contentType = rangeResponse.headers.get('content-type') || undefined
  }
  if (!acceptRanges) {
    acceptRanges = rangeResponse.headers.get('accept-ranges') || undefined
  }

  return {
    success: true,
    bytes,
    transport: {
      headStatus,
      rangeStatus: rangeResponse.status,
      contentLength,
      contentType,
      acceptRanges,
      contentRange: rangeResponse.headers.get('content-range') || undefined,
      requestedHeaderBytes: headerBytes,
      receivedHeaderBytes: bytes.byteLength
    },
    warnings
  }
}
