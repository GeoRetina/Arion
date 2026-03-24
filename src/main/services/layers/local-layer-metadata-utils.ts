import { basename, extname } from 'path'
import type { ImportGeoPackageResult } from '../../../shared/ipc-types'
import { buildGeoJsonMetadata, normalizeGeoJson } from '../../../shared/lib/vector-import-utils'
import { VectorMetadataExtractor } from '../../../shared/lib/vector-metadata-extractor'
import type { LayerMetadata } from '../../../shared/types/layer-types'

export { buildGeoJsonMetadata as buildGeoJsonLayerMetadata, normalizeGeoJson }

export function buildGeoPackageLayerMetadata(
  importResult: ImportGeoPackageResult,
  sourcePath: string
): LayerMetadata {
  return VectorMetadataExtractor.extractGeopackageMetadata(
    {
      features: importResult.geojson.features
    },
    {
      sourceLayers: importResult.sourceLayers,
      sourceLayerCount: importResult.layerCount,
      importWarnings: importResult.warnings,
      mergedLayerPropertyName: importResult.mergedLayerPropertyName,
      localFilePath: sourcePath
    }
  )
}

export function basenameWithoutExtension(filePath: string): string {
  return basename(filePath, extname(filePath))
}
