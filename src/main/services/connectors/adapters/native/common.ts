const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

export const readString = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export const parsePositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value.trim())
        : NaN

  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(numeric)))
}

export const toHeaderNumber = (value: string | null): number | undefined => {
  if (!value) {
    return undefined
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export const toSafeNumberOrString = (value: bigint): number | string => {
  if (value <= MAX_SAFE_INTEGER_BIGINT) {
    return Number(value)
  }
  return value.toString()
}

export const encodeHeaderHex = (bytes: Uint8Array, maxBytes = 64): string => {
  const slice = bytes.slice(0, Math.min(maxBytes, bytes.length))
  return Array.from(slice)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ')
}
