import { buildManagedVectorLayerDefinition } from '../../../../../shared/lib/managed-vector-layer'
import type { RegisterVectorAssetResult } from '../../../../../shared/ipc-types'
import type { LayerDefinition } from '../../../../../shared/types/layer-types'
import { resolveLocalImportFilePath } from './local-import-file-path'

export type ManagedVectorAssetFormat = 'geojson' | 'shapefile' | 'geopackage'

interface RegisterManagedVectorAssetOptions {
  onResolveStart?: () => void
  onRegisterStart?: (sourcePath: string) => void
}

export async function registerManagedVectorAssetFromFile(
  file: File,
  format: ManagedVectorAssetFormat,
  options: RegisterManagedVectorAssetOptions = {}
): Promise<{ asset: RegisterVectorAssetResult; sourcePath: string } | null> {
  options.onResolveStart?.()

  const sourcePath = await resolveLocalImportFilePath(file)
  if (!sourcePath) {
    return null
  }

  options.onRegisterStart?.(sourcePath)

  return {
    asset: await window.ctg.layers.registerVectorAsset({
      sourcePath,
      format
    }),
    sourcePath
  }
}

export function buildLayerFromManagedVectorAsset(
  asset: RegisterVectorAssetResult,
  fileName: string,
  sourcePath: string
): LayerDefinition {
  return buildManagedVectorLayerDefinition(asset, fileName, sourcePath)
}
