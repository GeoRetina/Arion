import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from '../constants'

export const normalizeTimeout = (timeoutMs?: number): number => {
  if (!timeoutMs) return DEFAULT_TIMEOUT_MS
  if (timeoutMs < MIN_TIMEOUT_MS) return MIN_TIMEOUT_MS
  if (timeoutMs > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS
  return timeoutMs
}

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

export const buildCapabilitiesUrl = (
  baseUrl: string,
  service: 'WMS' | 'WMTS',
  version: string
): string => {
  const url = new URL(baseUrl)
  url.searchParams.set('service', service)
  url.searchParams.set('request', 'GetCapabilities')
  url.searchParams.set('version', version)
  return url.toString()
}

export const isTiffHeader = (bytes: Uint8Array): boolean => {
  if (bytes.length < 4) return false
  const littleEndian =
    bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00
  const bigEndian = bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a
  return littleEndian || bigEndian
}
