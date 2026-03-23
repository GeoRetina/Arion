import { promises as fs } from 'fs'
import { basename, extname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { ImportGeoPackageResult, RegisterGeoTiffAssetResult } from '../../../shared/ipc-types'
import { LayerStyleFactory } from '../../../shared/lib/layer-style-factory'
import { VectorMetadataExtractor } from '../../../shared/lib/vector-metadata-extractor'
import type { LayerCreateInput } from '../../../shared/types/layer-types'
import { ensureLocalFilesystemPath } from '../../security/path-security'
import { getRasterTileService } from '../raster/raster-tile-service'
import { getGeoPackageImportService } from '../vector/geopackage-import-service'

type GeoJsonRecord = Record<string, unknown>

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonRecord[]
}

export class LocalLayerImportService {
  public async importPath(
    sourcePath: string,
    options: { layerName?: string } = {}
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
        return await this.importGeoJsonPath(safeSourcePath, options.layerName)
      case '.gpkg':
        return await this.importGeoPackagePath(safeSourcePath, options.layerName)
      case '.tif':
      case '.tiff':
        return await this.importGeoTiffPath(safeSourcePath, options.layerName)
      default:
        throw new Error(
          `Automatic layer import for "${extension || 'unknown'}" outputs is not supported yet. Prefer GeoJSON, GeoPackage, or GeoTIFF outputs for live import.`
        )
    }
  }

  private async importGeoJsonPath(
    sourcePath: string,
    layerName?: string
  ): Promise<LayerCreateInput> {
    const fileContents = await fs.readFile(sourcePath, 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(fileContents)
    } catch (error) {
      throw new Error(
        `Failed to parse GeoJSON output "${sourcePath}": ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const normalizedGeoJson = normalizeGeoJson(parsed)
    const metadata = VectorMetadataExtractor.extractGeoJSONMetadata({
      features: normalizedGeoJson.features.map((feature) => feature)
    })

    return {
      name: layerName || basenameWithoutExtension(sourcePath),
      type: 'vector',
      sourceId: `source-${uuidv4()}`,
      sourceConfig: {
        type: 'geojson',
        data: normalizedGeoJson
      },
      style: LayerStyleFactory.createVectorStyle(metadata.geometryType),
      visibility: true,
      opacity: 1,
      zIndex: 0,
      metadata: {
        ...metadata,
        context: {
          ...(metadata.context || {}),
          localFilePath: sourcePath
        }
      },
      isLocked: false,
      createdBy: 'import'
    }
  }

  private async importGeoPackagePath(
    sourcePath: string,
    layerName?: string
  ): Promise<LayerCreateInput> {
    const importResult = await getGeoPackageImportService().importFile(sourcePath)
    return buildVectorLayerFromGeoPackage(importResult, sourcePath, layerName)
  }

  private async importGeoTiffPath(
    sourcePath: string,
    layerName?: string
  ): Promise<LayerCreateInput> {
    const asset = await getRasterTileService().registerGeoTiffAsset({ sourcePath })
    return buildRasterLayerFromAsset(asset, sourcePath, layerName)
  }
}

function buildVectorLayerFromGeoPackage(
  importResult: ImportGeoPackageResult,
  sourcePath: string,
  layerName?: string
): LayerCreateInput {
  const metadata = VectorMetadataExtractor.extractGeopackageMetadata(
    {
      features: importResult.geojson.features.map((feature) => feature)
    },
    {
      sourceLayers: importResult.sourceLayers,
      sourceLayerCount: importResult.layerCount,
      importWarnings: importResult.warnings,
      mergedLayerPropertyName: importResult.mergedLayerPropertyName,
      localFilePath: sourcePath
    }
  )

  return {
    name: layerName || basenameWithoutExtension(sourcePath),
    type: 'vector',
    sourceId: `source-${uuidv4()}`,
    sourceConfig: {
      type: 'geojson',
      data: importResult.geojson
    },
    style: LayerStyleFactory.createVectorStyle(metadata.geometryType),
    visibility: true,
    opacity: 1,
    zIndex: 0,
    metadata,
    isLocked: false,
    createdBy: 'import'
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
        localFilePath: sourcePath
      }
    },
    isLocked: false,
    createdBy: 'import'
  }
}

function normalizeGeoJson(value: unknown): GeoJsonFeatureCollection {
  const geoJsonRecord = asRecord(value)
  if (!geoJsonRecord || typeof geoJsonRecord.type !== 'string') {
    throw new Error('Invalid GeoJSON structure')
  }

  if (geoJsonRecord.type === 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: Array.isArray(geoJsonRecord.features)
        ? geoJsonRecord.features.filter((feature): feature is GeoJsonRecord =>
            Boolean(asRecord(feature))
          )
        : []
    }
  }

  if (geoJsonRecord.type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [geoJsonRecord]
    }
  }

  if ('coordinates' in geoJsonRecord) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: geoJsonRecord,
          properties: {}
        }
      ]
    }
  }

  throw new Error('Invalid GeoJSON structure')
}

function asRecord(value: unknown): GeoJsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GeoJsonRecord)
    : null
}

function basenameWithoutExtension(filePath: string): string {
  return basename(filePath, extname(filePath))
}
