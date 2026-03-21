import type { GeoTiffAssetProcessingStatus } from '../../../../../../shared/ipc-types'
import type {
  GeoPackageImportProgressStatus,
  GeoPackageImportStage
} from '@/services/layer-import/processors/geopackage-processor'

export interface LayerImportProgress {
  title: string
  message: string
  progress: number
}

export function createInitialRasterImportProgressState(): LayerImportProgress {
  return {
    title: 'Queued',
    message: 'Preparing raster import',
    progress: 0
  }
}

export function createRasterImportProgressState(
  status: GeoTiffAssetProcessingStatus
): LayerImportProgress {
  return {
    title: RASTER_STAGE_LABELS[status.stage] ?? 'Processing raster',
    message: status.message?.trim() || 'Processing raster',
    progress: Math.round(status.progress)
  }
}

export function createInitialGeoPackageImportProgressState(fileName: string): LayerImportProgress {
  return {
    title: 'Preparing GeoPackage',
    message: `Opening ${fileName}`,
    progress: 5
  }
}

export function createGeoPackageImportProgressState(
  status: GeoPackageImportProgressStatus
): LayerImportProgress {
  return {
    title: GEO_PACKAGE_STAGE_LABELS[status.stage] ?? 'Importing GeoPackage',
    message: status.message.trim() || 'Importing GeoPackage',
    progress: Math.round(status.progress)
  }
}

export function getRasterProgressSignature(status: GeoTiffAssetProcessingStatus): string {
  return `${status.stage}|${Math.round(status.progress)}|${status.message?.trim() ?? ''}`
}

export function getGeoPackageProgressSignature(status: GeoPackageImportProgressStatus): string {
  return `${status.stage}|${Math.round(status.progress)}|${status.message.trim()}`
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

const GEO_PACKAGE_STAGE_LABELS: Record<GeoPackageImportStage, string> = {
  resolving: 'Preparing GeoPackage',
  importing: 'Reading GeoPackage',
  finalizing: 'Creating layer'
}
