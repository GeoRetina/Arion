import type { GeoTiffAssetProcessingStatus } from '../../../../../../shared/ipc-types'

export interface RasterImportProgress {
  title: string
  message: string
  progress: number
}

export function createInitialRasterProgressToastState(): RasterImportProgress {
  return {
    title: 'Queued',
    message: 'Preparing raster import',
    progress: 0
  }
}

export function createRasterProgressToastState(
  status: GeoTiffAssetProcessingStatus
): RasterImportProgress {
  return {
    title: RASTER_STAGE_LABELS[status.stage] ?? 'Processing raster',
    message: status.message?.trim() || 'Processing raster',
    progress: Math.round(status.progress)
  }
}

export function getRasterProgressSignature(status: GeoTiffAssetProcessingStatus): string {
  return `${status.stage}|${Math.round(status.progress)}|${status.message?.trim() ?? ''}`
}

const RASTER_STAGE_LABELS: Record<GeoTiffAssetProcessingStatus['stage'], string> = {
  queued: 'Queued',
  preparing: 'Preparing source',
  validating: 'Validating raster',
  preprocessing: 'Optimizing raster',
  loading: 'Rendering raster',
  ready: 'Ready',
  error: 'Failed'
}
