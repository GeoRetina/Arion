export type SupportedRasterCrs = 'EPSG:4326' | 'EPSG:3857'

export type BoundingBox = [number, number, number, number]

export type RasterProcessingEngine = 'gdal' | 'geotiff-js'

export type RasterProcessingStage =
  | 'queued'
  | 'preparing'
  | 'validating'
  | 'preprocessing'
  | 'loading'
  | 'ready'
  | 'error'

export interface GeoTiffAssetProcessingStatus {
  jobId: string
  assetId?: string
  stage: RasterProcessingStage
  progress: number
  message: string
  startedAt: string
  updatedAt: string
  processingEngine?: RasterProcessingEngine
  warning?: string
  error?: string
}

export interface RegisterGeoTiffAssetRequest {
  fileName: string
  filePath?: string
  fileBuffer?: ArrayBuffer
  jobId?: string
}

export interface RegisterGeoTiffAssetResult {
  assetId: string
  tilesUrlTemplate: string
  bounds: BoundingBox
  sourceBounds: BoundingBox
  crs: SupportedRasterCrs
  width: number
  height: number
  bandCount: number
  minZoom: number
  maxZoom: number
  processingEngine: RasterProcessingEngine
  processingWarning?: string
}

export interface RasterTileRequest {
  assetId: string
  z: number
  x: number
  y: number
}
