import { promises as fs } from 'fs'
import type { RegisterGeoTiffAssetResult } from '../../../shared/ipc-types'
import type {
  BoundingBox,
  LayerCreateInput,
  LayerMetadata,
  LayerSourceOptions
} from '../../../shared/types/layer-types'
import {
  basenameWithoutExtension,
  buildGeoJsonLayerMetadata,
  buildGeoPackageLayerMetadata,
  normalizeGeoJson
} from '../layers/local-layer-metadata-utils'
import { getRasterTileService, type RasterTileService } from '../raster/raster-tile-service'
import {
  getGeoPackageImportService,
  type GeoPackageImportService
} from '../vector/geopackage-import-service'
import type {
  QgisArtifactRecord,
  QgisImportedLayerRecord,
  QgisOutputLayerMetadataSummary,
  QgisOutputLayerSummary,
  QgisOutputRecord
} from './types'

interface QgisOutputInspectorDeps {
  geoPackageImportService?: Pick<GeoPackageImportService, 'importFile'>
  rasterTileService?: Pick<RasterTileService, 'registerGeoTiffAsset' | 'releaseGeoTiffAsset'>
}

export class QgisOutputInspector {
  private readonly geoPackageImportService: Pick<GeoPackageImportService, 'importFile'>
  private readonly rasterTileService: Pick<
    RasterTileService,
    'registerGeoTiffAsset' | 'releaseGeoTiffAsset'
  >

  constructor(deps: QgisOutputInspectorDeps = {}) {
    this.geoPackageImportService = deps.geoPackageImportService ?? getGeoPackageImportService()
    this.rasterTileService = deps.rasterTileService ?? getRasterTileService()
  }

  public async summarizeArtifacts(
    artifacts: QgisArtifactRecord[],
    importedLayers: QgisImportedLayerRecord[]
  ): Promise<QgisOutputRecord[]> {
    const importedLayersByPath = new Map<string, QgisImportedLayerRecord>()
    for (const importedLayer of importedLayers) {
      importedLayersByPath.set(toPathLookupKey(importedLayer.path), importedLayer)
    }

    return await Promise.all(
      artifacts.map(async (artifact) => {
        const importedLayer = importedLayersByPath.get(toPathLookupKey(artifact.path))
        if (importedLayer) {
          return {
            ...copyArtifactRecord(artifact),
            layer: summarizeImportedLayer(importedLayer.layer)
          }
        }

        return await this.inspectArtifact(artifact)
      })
    )
  }

  private async inspectArtifact(artifact: QgisArtifactRecord): Promise<QgisOutputRecord> {
    const baseRecord = copyArtifactRecord(artifact)
    if (!artifact.exists) {
      return baseRecord
    }

    try {
      if (artifact.kind === 'vector') {
        return {
          ...baseRecord,
          layer: await this.inspectVectorArtifact(artifact.path)
        }
      }

      if (artifact.kind === 'raster') {
        return {
          ...baseRecord,
          layer: await this.inspectRasterArtifact(artifact.path)
        }
      }

      return baseRecord
    } catch (error) {
      return {
        ...baseRecord,
        inspectionError: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async inspectVectorArtifact(artifactPath: string): Promise<QgisOutputLayerSummary> {
    if (artifactPath.toLowerCase().endsWith('.gpkg')) {
      const importResult = await this.geoPackageImportService.importFile(artifactPath)
      const metadata = buildGeoPackageLayerMetadata(importResult, artifactPath)
      return buildVectorLayerSummary({
        name: basenameWithoutExtension(artifactPath),
        metadata,
        sourceType: 'geojson'
      })
    }

    const rawContents = await fs.readFile(artifactPath, 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(rawContents)
    } catch (error) {
      throw new Error(
        `Failed to parse GeoJSON output "${artifactPath}": ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const normalizedGeoJson = normalizeGeoJson(parsed)
    const metadata = buildGeoJsonLayerMetadata(normalizedGeoJson, artifactPath)
    return buildVectorLayerSummary({
      name: basenameWithoutExtension(artifactPath),
      metadata,
      sourceType: 'geojson'
    })
  }

  private async inspectRasterArtifact(artifactPath: string): Promise<QgisOutputLayerSummary> {
    const asset = await this.rasterTileService.registerGeoTiffAsset({
      sourcePath: artifactPath
    })

    try {
      return buildRasterLayerSummary({
        name: basenameWithoutExtension(artifactPath),
        sourceType: 'raster',
        asset
      })
    } finally {
      await this.rasterTileService.releaseGeoTiffAsset(asset.assetId).catch(() => {})
    }
  }
}

function copyArtifactRecord(artifact: QgisArtifactRecord): QgisOutputRecord {
  return {
    path: artifact.path,
    kind: artifact.kind,
    exists: artifact.exists,
    selectedForImport: artifact.selectedForImport === true,
    imported: artifact.imported === true,
    importError: artifact.importError
  }
}

function summarizeImportedLayer(layer: LayerCreateInput): QgisOutputLayerSummary {
  if (layer.type === 'raster') {
    return buildRasterLayerSummary({
      name: layer.name,
      sourceType: 'raster',
      sourceId: layer.sourceId,
      metadata: layer.metadata,
      sourceOptions: layer.sourceConfig.options
    })
  }

  return buildVectorLayerSummary({
    name: layer.name,
    sourceType: 'geojson',
    sourceId: layer.sourceId,
    metadata: layer.metadata
  })
}

function buildVectorLayerSummary(input: {
  name: string
  metadata: LayerMetadata
  sourceType: 'geojson'
  sourceId?: string
}): QgisOutputLayerSummary {
  return {
    name: input.name,
    type: 'vector',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    metadata: summarizeLayerMetadata(input.metadata)
  }
}

function buildRasterLayerSummary(input: {
  name: string
  sourceType: 'raster'
  sourceId?: string
  metadata?: LayerMetadata
  sourceOptions?: LayerSourceOptions
  asset?: RegisterGeoTiffAssetResult
}): QgisOutputLayerSummary {
  const rasterSummary = summarizeRasterMetadata(input.metadata, input.sourceOptions, input.asset)
  const baseMetadata = input.metadata
    ? summarizeLayerMetadata(input.metadata)
    : {
        description: `Imported GeoTIFF output ${input.name}`,
        tags: buildRasterTags(input.asset),
        bounds: input.asset?.bounds,
        crs: input.asset?.crs
      }

  return {
    name: input.name,
    type: 'raster',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    metadata: {
      ...baseMetadata,
      ...(rasterSummary ? { raster: rasterSummary } : {})
    }
  }
}

function summarizeLayerMetadata(metadata: LayerMetadata): QgisOutputLayerMetadataSummary {
  const context = asRecord(metadata.context)
  const summary: QgisOutputLayerMetadataSummary = {
    description: metadata.description,
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    geometryType: metadata.geometryType,
    featureCount: metadata.featureCount,
    bounds: isBoundingBox(metadata.bounds) ? metadata.bounds : undefined,
    crs: readString(metadata.crs),
    attributeKeys:
      metadata.attributes && Object.keys(metadata.attributes).length > 0
        ? Object.keys(metadata.attributes)
        : undefined,
    sourceLayers: toSourceLayers(context?.sourceLayers),
    sourceLayerCount: readInteger(context?.sourceLayerCount),
    mergedLayerPropertyName: readString(context?.mergedLayerPropertyName),
    warnings: toStringArray(context?.importWarnings)
  }

  return stripUndefined(summary)
}

function summarizeRasterMetadata(
  metadata: LayerMetadata | undefined,
  sourceOptions: LayerSourceOptions | undefined,
  asset: RegisterGeoTiffAssetResult | undefined
): NonNullable<QgisOutputLayerMetadataSummary['raster']> | undefined {
  const context = asRecord(metadata?.context)
  const rasterSummary = stripUndefined({
    bandCount:
      readInteger(sourceOptions?.rasterBandCount) ??
      readInteger(context?.bandCount) ??
      readInteger(asset?.bandCount),
    width: readInteger(context?.width) ?? readInteger(asset?.width),
    height: readInteger(context?.height) ?? readInteger(asset?.height),
    minZoom: readInteger(sourceOptions?.minZoom) ?? readInteger(asset?.minZoom),
    maxZoom: readInteger(sourceOptions?.maxZoom) ?? readInteger(asset?.maxZoom),
    sourceBounds: toBoundingBox(context?.sourceBounds) ?? toBoundingBox(asset?.sourceBounds),
    processingEngine:
      readRasterProcessingEngine(context?.processingEngine) ?? asset?.processingEngine,
    processingWarning:
      readString(context?.processingWarning) ?? readString(asset?.processingWarning)
  })

  return Object.keys(rasterSummary).length > 0 ? rasterSummary : undefined
}

function buildRasterTags(asset: RegisterGeoTiffAssetResult | undefined): string[] {
  const tags = ['imported', 'geotiff']
  if (asset?.processingEngine) {
    tags.push(asset.processingEngine)
  }
  if (asset?.processingWarning) {
    tags.push('raster-warning')
  }
  return tags
}

function toSourceLayers(
  value: unknown
): QgisOutputLayerMetadataSummary['sourceLayers'] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const sourceLayers = value
    .map((entry) => {
      const record = asRecord(entry)
      const name = readString(record?.name)
      if (!name) {
        return null
      }

      return stripUndefined({
        name,
        featureCount: readInteger(record?.featureCount) ?? 0,
        geometryType: readString(record?.geometryType),
        crs: readString(record?.crs)
      })
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  return sourceLayers.length > 0 ? sourceLayers : undefined
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const entries = value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => typeof entry === 'string')

  return entries.length > 0 ? entries : undefined
}

function toBoundingBox(value: unknown): BoundingBox | undefined {
  return isBoundingBox(value) ? value : undefined
}

function isBoundingBox(value: unknown): value is BoundingBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function readInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readRasterProcessingEngine(value: unknown): 'gdal' | 'geotiff-js' | undefined {
  return value === 'gdal' || value === 'geotiff-js' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined
    )
  ) as T
}

function toPathLookupKey(filePath: string): string {
  const normalizedPath = filePath.replace(/[\\/]+/g, '/')
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}
