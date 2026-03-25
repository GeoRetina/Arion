import { promises as fs } from 'fs'
import { basename, extname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type {
  RegisterGeoTiffAssetResult,
  RegisterVectorAssetResult
} from '../../../shared/ipc-types'
import { buildManagedVectorLayerInput } from '../../../shared/lib/managed-vector-layer'
import { LayerStyleFactory } from '../../../shared/lib/layer-style-factory'
import type { LayerCreateInput } from '../../../shared/types/layer-types'
import { ensureLocalFilesystemPath } from '../../security/path-security'
import { getRasterTileService } from '../raster/raster-tile-service'
import { getVectorAssetService } from '../vector/vector-asset-service'
import { basenameWithoutExtension } from './local-layer-metadata-utils'

type ManagedVectorImportFormat = 'geojson' | 'shapefile' | 'geopackage'

export class LocalLayerImportService {
  public async importPath(
    sourcePath: string,
    options: { layerName?: string; geotiffJobId?: string } = {}
  ): Promise<LayerCreateInput> {
    const safeSourcePath = ensureLocalFilesystemPath(sourcePath, 'Layer source path')
    const fileStats = await fs.stat(safeSourcePath).catch(() => null)
    if (!fileStats?.isFile()) {
      throw new Error('Layer source path must point to a readable local file')
    }

    const extension = extname(safeSourcePath).toLowerCase()
    switch (extension) {
      case '.geojson':
      case '.json':
        return await this.importManagedVectorPath(safeSourcePath, 'geojson', options.layerName)
      case '.shp':
      case '.zip':
        return await this.importManagedVectorPath(safeSourcePath, 'shapefile', options.layerName)
      case '.gpkg':
        return await this.importManagedVectorPath(safeSourcePath, 'geopackage', options.layerName)
      case '.tif':
      case '.tiff':
        return await this.importGeoTiffPath(safeSourcePath, options.layerName, options.geotiffJobId)
      default:
        throw new Error(
          `Automatic layer import for "${extension || 'unknown'}" outputs is not supported yet. Prefer GeoJSON, GeoPackage, or GeoTIFF outputs for live import.`
        )
    }
  }

  private async importManagedVectorPath(
    sourcePath: string,
    format: ManagedVectorImportFormat,
    layerName?: string
  ): Promise<LayerCreateInput> {
    const asset = await getVectorAssetService().registerVectorAsset({
      sourcePath,
      format
    })
    return buildManagedVectorLayerFromAsset(asset, sourcePath, layerName)
  }

  private async importGeoTiffPath(
    sourcePath: string,
    layerName?: string,
    geotiffJobId?: string
  ): Promise<LayerCreateInput> {
    const asset = await getRasterTileService().registerGeoTiffAsset({
      sourcePath,
      ...(geotiffJobId ? { jobId: geotiffJobId } : {})
    })
    return buildRasterLayerFromAsset(asset, sourcePath, layerName)
  }
}

function buildManagedVectorLayerFromAsset(
  asset: RegisterVectorAssetResult,
  sourcePath: string,
  layerName?: string
): LayerCreateInput {
  return {
    ...buildManagedVectorLayerInput(
      asset,
      layerName || basenameWithoutExtension(sourcePath),
      sourcePath
    ),
    sourceId: `source-${uuidv4()}`
  }
}

function buildRasterLayerFromAsset(
  asset: RegisterGeoTiffAssetResult,
  sourcePath: string,
  layerName?: string
): LayerCreateInput {
  return {
    name: layerName || basenameWithoutExtension(sourcePath),
    type: 'raster',
    sourceId: `source-${uuidv4()}`,
    sourceConfig: {
      type: 'raster',
      data: asset.tilesUrlTemplate,
      options: {
        tileSize: 256,
        minZoom: asset.minZoom,
        maxZoom: asset.maxZoom,
        bounds: asset.bounds,
        rasterAssetId: asset.assetId,
        rasterSourcePath: sourcePath,
        rasterBandCount: asset.bandCount
      }
    },
    style: LayerStyleFactory.createRasterStyle(),
    visibility: true,
    opacity: 1,
    zIndex: 0,
    metadata: {
      description: `Imported GeoTIFF output ${basename(sourcePath)}`,
      tags: ['imported', 'geotiff', asset.processingEngine],
      source: sourcePath,
      bounds: asset.bounds,
      crs: asset.crs,
      context: {
        localFilePath: sourcePath,
        sourceBounds: asset.sourceBounds,
        width: asset.width,
        height: asset.height,
        bandCount: asset.bandCount,
        processingEngine: asset.processingEngine,
        processingWarning: asset.processingWarning
      }
    },
    isLocked: false,
    createdBy: 'import'
  }
}
