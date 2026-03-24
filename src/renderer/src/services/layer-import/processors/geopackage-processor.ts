import type {
  GeoPackageSourceLayerSummary,
  ImportGeoPackageResult
} from '../../../../../shared/ipc-types'
import type { LayerDefinition } from '../../../../../shared/types/layer-types'
import {
  buildLayerFromManagedVectorAsset,
  registerManagedVectorAssetFromFile
} from './managed-vector-asset'
import { resolveLocalImportFilePath } from './local-import-file-path'

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
    const registeredAsset = await registerManagedVectorAssetFromFile(file, 'geopackage', {
      onResolveStart: () =>
        onProgress?.({
          stage: 'resolving',
          progress: 12,
          message: 'Resolving local GeoPackage path'
        }),
      onRegisterStart: () =>
        onProgress?.({
          stage: 'importing',
          progress: 45,
          message: 'Converting GeoPackage into a managed vector asset'
        })
    })
    if (!registeredAsset) {
      throw new Error(
        'GeoPackage import requires a local file path. Re-select the file and try again.'
      )
    }

    onProgress?.({
      stage: 'finalizing',
      progress: 88,
      message: `Preparing ${registeredAsset.asset.featureCount.toLocaleString()} imported features`
    })

    return buildLayerFromManagedVectorAsset(
      registeredAsset.asset,
      fileName,
      registeredAsset.sourcePath
    )
  }

  static async analyzeFile(file: File): Promise<{
    featureCount: number
    layerCount: number
    geometryTypes: string[]
    sourceLayers: GeoPackageSourceLayerSummary[]
    warnings: string[]
  }> {
    const { importResult } = await this.importGeoPackage(file)

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
  ): Promise<{ importResult: ImportGeoPackageResult; sourcePath: string }> {
    onProgress?.({
      stage: 'resolving',
      progress: 12,
      message: 'Resolving local GeoPackage path'
    })

    const sourcePath = await resolveLocalImportFilePath(file)
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

    return {
      importResult: await window.ctg.layers.importGeoPackage({ sourcePath }),
      sourcePath
    }
  }
}
