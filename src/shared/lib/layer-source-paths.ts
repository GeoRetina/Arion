type LayerSourcePathLike = {
  sourceConfig?: {
    data?: unknown
    options?: {
      rasterSourcePath?: unknown
    } | null
  } | null
  metadata?: {
    context?: Record<string, unknown> | null
  } | null
}

export function trimToNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isExternalLayerReference(value: string): boolean {
  const normalized = value.trim().toLowerCase()

  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('arion-raster:')
  )
}

function isAbsoluteFilesystemPath(value: string): boolean {
  const trimmed = value.trim()

  return /^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')
}

export function resolveLocalLayerFilePath(layer: LayerSourcePathLike): string | null {
  const contextPath = trimToNonEmptyString(layer.metadata?.context?.localFilePath)
  if (contextPath) {
    return contextPath
  }

  const rasterSourcePath = trimToNonEmptyString(layer.sourceConfig?.options?.rasterSourcePath)
  if (rasterSourcePath) {
    return rasterSourcePath
  }

  const sourceData = trimToNonEmptyString(layer.sourceConfig?.data)
  if (sourceData && !isExternalLayerReference(sourceData) && isAbsoluteFilesystemPath(sourceData)) {
    return sourceData
  }

  return null
}
