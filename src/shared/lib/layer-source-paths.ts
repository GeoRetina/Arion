type LayerSourcePathLike = {
  sourceConfig?: {
    data?: unknown
    options?: {
      rasterSourcePath?: unknown
      vectorSourcePath?: unknown
    } | null
  } | null
  metadata?: {
    context?: Record<string, unknown> | null
  } | null
}

const QGIS_COMPATIBLE_LAYER_EXTENSIONS = new Set([
  '.geojson',
  '.json',
  '.gpkg',
  '.shp',
  '.tif',
  '.tiff'
])

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
    normalized.startsWith('arion-raster:') ||
    normalized.startsWith('arion-vector:')
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

  const vectorSourcePath = trimToNonEmptyString(layer.sourceConfig?.options?.vectorSourcePath)
  if (vectorSourcePath) {
    return vectorSourcePath
  }

  const sourceData = trimToNonEmptyString(layer.sourceConfig?.data)
  if (sourceData && !isExternalLayerReference(sourceData) && isAbsoluteFilesystemPath(sourceData)) {
    return sourceData
  }

  return null
}

export function isQgisCompatibleLayerInputPath(value: string): boolean {
  if (isExternalLayerReference(value) || !isAbsoluteFilesystemPath(value)) {
    return false
  }

  return QGIS_COMPATIBLE_LAYER_EXTENSIONS.has(getPathExtension(value))
}

export function resolveQgisLayerInputPath(layer: LayerSourcePathLike): string | null {
  const localPath = resolveLocalLayerFilePath(layer)
  if (!localPath || !isQgisCompatibleLayerInputPath(localPath)) {
    return null
  }

  return localPath
}

function getPathExtension(value: string): string {
  const trimmed = value.trim()
  const sanitized = trimmed.replace(/[?#].*$/u, '')
  const lastSlashIndex = Math.max(sanitized.lastIndexOf('/'), sanitized.lastIndexOf('\\'))
  const fileName = lastSlashIndex >= 0 ? sanitized.slice(lastSlashIndex + 1) : sanitized
  const extensionIndex = fileName.lastIndexOf('.')

  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : ''
}
