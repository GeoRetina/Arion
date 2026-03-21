import { v4 as uuidv4 } from 'uuid'
import type {
  GeoPackageSourceLayerSummary,
  ImportGeoPackageResult
} from '../../../../../shared/ipc-types'
import type {
  LayerDefinition,
  LayerType,
  LayerSourceConfig
} from '../../../../../shared/types/layer-types'
import { VectorMetadataExtractor } from '../metadata/vector-metadata-extractor'
import { LayerStyleFactory } from '../styles/layer-style-factory'
import { resolveLocalImportFilePath } from './local-import-file-path'
import { toMetadataFeature } from './vector-feature-utils'

export type GeoPackageImportStage = 'resolving' | 'importing' | 'finalizing'

export interface GeoPackageImportProgressStatus {
  stage: GeoPackageImportStage
  progress: number
  message: string
}

export class GeopackageProcessor {
  static async processFile(
    file: File,
    fileName: string,
    onProgress?: (status: GeoPackageImportProgressStatus) => void
  ): Promise<LayerDefinition> {
    const importResult = await this.importGeoPackage(file, onProgress)
    onProgress?.({
      stage: 'finalizing',
      progress: 88,
      message: `Preparing ${importResult.featureCount.toLocaleString()} imported features`
    })

    const metadata = VectorMetadataExtractor.extractGeopackageMetadata(
      {
        features: importResult.geojson.features.map((feature) => toMetadataFeature(feature))
      },
      {
        sourceLayers: importResult.sourceLayers,
        sourceLayerCount: importResult.layerCount,
        importWarnings: importResult.warnings,
        mergedLayerPropertyName: importResult.mergedLayerPropertyName
      }
    )
    const style = LayerStyleFactory.createVectorStyle(metadata.geometryType)

    return {
      id: uuidv4(),
      name: fileName,
      type: 'vector' as LayerType,
      sourceId: `source-${uuidv4()}`,
      sourceConfig: {
        type: 'geojson',
        data: importResult.geojson
      } as LayerSourceConfig,
      style,
      visibility: true,
      opacity: 1.0,
      zIndex: 0,
      metadata,
      isLocked: false,
      createdBy: 'import',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  static async analyzeFile(file: File): Promise<{
    featureCount: number
    layerCount: number
    geometryTypes: string[]
    sourceLayers: GeoPackageSourceLayerSummary[]
    warnings: string[]
  }> {
    const importResult = await this.importGeoPackage(file)

    return {
      featureCount: importResult.featureCount,
      layerCount: importResult.layerCount,
      geometryTypes: Array.from(
        new Set(
          importResult.sourceLayers
            .map((layer) => layer.geometryType)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
      ),
      sourceLayers: importResult.sourceLayers,
      warnings: importResult.warnings
    }
  }

  private static async importGeoPackage(
    file: File,
    onProgress?: (status: GeoPackageImportProgressStatus) => void
  ): Promise<ImportGeoPackageResult> {
    onProgress?.({
      stage: 'resolving',
      progress: 12,
      message: 'Resolving local GeoPackage path'
    })

    const sourcePath = await this.resolveSourcePath(file)
    if (!sourcePath) {
      throw new Error(
        'GeoPackage import requires a local file path. Re-select the file and try again.'
      )
    }

    onProgress?.({
      stage: 'importing',
      progress: 45,
      message: 'Inspecting and converting GeoPackage layers'
    })

    return await window.ctg.layers.importGeoPackage({ sourcePath })
  }

  private static async resolveSourcePath(file: File): Promise<string | null> {
    return await resolveLocalImportFilePath(file)
  }
}
