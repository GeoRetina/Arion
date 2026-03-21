import { promises as fs } from 'fs'
import type {
  GeoPackageSourceLayerSummary,
  ImportGeoPackageResult
} from '../../../shared/ipc-types'
import { ensureLocalFilesystemPath } from '../../security/path-security'
import { getGdalRunnerService, type GdalRunnerService } from '../raster/gdal-runner-service'

const OGRINFO_TIMEOUT_MS = 30 * 1000
const OGR2OGR_TIMEOUT_MS = 2 * 60 * 1000
const OGR_STDOUT_PATH = '/vsistdout/'
const DEFAULT_MERGED_LAYER_PROPERTY_NAME = '__gpkg_layer'

type GeoJsonRecord = Record<string, unknown>
type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonRecord[]
}

type OgrInfoPayload = {
  layers?: OgrInfoLayerSummary[]
}

type OgrInfoLayerSummary = {
  name?: string
  featureCount?: number
  geometryFields?: Array<{
    type?: string
  }>
}

type ConvertedLayer = {
  layerName: string
  collection: GeoJsonFeatureCollection
}

export class GeoPackageImportService {
  constructor(private readonly gdalRunner: GdalRunnerService = getGdalRunnerService()) {}

  async importFile(sourcePath: string): Promise<ImportGeoPackageResult> {
    const safeSourcePath = ensureLocalFilesystemPath(sourcePath, 'GeoPackage source path')
    await assertReadableFile(safeSourcePath)

    const availability = await this.gdalRunner.getAvailability()
    if (!availability.available) {
      throw new Error(availability.reason || 'GDAL is not available')
    }

    const inspection = await this.inspectLayers(safeSourcePath)
    if (inspection.vectorLayers.length === 0) {
      if (inspection.totalLayerCount > 0) {
        throw new Error(
          'GeoPackage does not contain any vector layers. Raster and tile tables are not supported yet.'
        )
      }

      throw new Error('GeoPackage does not contain any importable layers')
    }

    const convertedLayers: ConvertedLayer[] = []
    for (const layer of inspection.vectorLayers) {
      const collection = await this.convertLayerToGeoJson(safeSourcePath, layer.name)
      convertedLayers.push({
        layerName: layer.name,
        collection
      })
    }

    const mergedLayerPropertyName =
      convertedLayers.length > 1 ? pickMergedLayerPropertyName(convertedLayers) : undefined
    const mergedGeoJson = mergeFeatureCollections(convertedLayers, mergedLayerPropertyName)
    const warnings = [...inspection.warnings]

    if (convertedLayers.length > 1) {
      warnings.push(`Merged ${convertedLayers.length} GeoPackage layers into a single import`)
    }

    if (mergedLayerPropertyName) {
      warnings.push(
        `Added "${mergedLayerPropertyName}" to imported features so source tables remain traceable`
      )
    }

    return {
      geojson: mergedGeoJson,
      featureCount: mergedGeoJson.features.length,
      layerCount: inspection.vectorLayers.length,
      sourceLayers: inspection.vectorLayers,
      crs: 'EPSG:4326',
      warnings: uniqueStrings(warnings),
      mergedLayerPropertyName
    }
  }

  private async inspectLayers(sourcePath: string): Promise<{
    totalLayerCount: number
    vectorLayers: GeoPackageSourceLayerSummary[]
    warnings: string[]
  }> {
    const result = await this.gdalRunner.run('ogrinfo', ['-json', '-so', sourcePath], {
      timeoutMs: OGRINFO_TIMEOUT_MS
    })

    let payload: OgrInfoPayload = {}
    try {
      payload = JSON.parse(result.stdout) as OgrInfoPayload
    } catch {
      throw new Error('Failed to parse GeoPackage layer metadata')
    }

    const layers = Array.isArray(payload.layers) ? payload.layers : []
    const vectorLayers = layers
      .map(toVectorLayerSummary)
      .filter((layer): layer is GeoPackageSourceLayerSummary => Boolean(layer))
    const skippedLayerCount = layers.length - vectorLayers.length
    const warnings: string[] = []

    if (skippedLayerCount > 0) {
      warnings.push(
        `Skipped ${skippedLayerCount} non-vector GeoPackage layer${skippedLayerCount === 1 ? '' : 's'}`
      )
    }

    return {
      totalLayerCount: layers.length,
      vectorLayers,
      warnings
    }
  }

  private async convertLayerToGeoJson(
    sourcePath: string,
    layerName: string
  ): Promise<GeoJsonFeatureCollection> {
    const result = await this.gdalRunner.run(
      'ogr2ogr',
      [
        '-f',
        'GeoJSON',
        '-lco',
        'RFC7946=YES',
        '-t_srs',
        'EPSG:4326',
        OGR_STDOUT_PATH,
        sourcePath,
        layerName
      ],
      {
        timeoutMs: OGR2OGR_TIMEOUT_MS
      }
    )

    let payload: unknown
    try {
      payload = JSON.parse(result.stdout)
    } catch {
      throw new Error(`Failed to parse converted GeoJSON for layer "${layerName}"`)
    }

    return normalizeFeatureCollection(payload, layerName)
  }
}

function toVectorLayerSummary(layer: OgrInfoLayerSummary): GeoPackageSourceLayerSummary | null {
  if (typeof layer.name !== 'string' || layer.name.trim().length === 0) {
    return null
  }

  const geometryFields = Array.isArray(layer.geometryFields) ? layer.geometryFields : []
  if (geometryFields.length === 0) {
    return null
  }

  const geometryType = geometryFields
    .map((field) => (typeof field.type === 'string' ? field.type : null))
    .find((value): value is string => Boolean(value))

  return {
    name: layer.name,
    featureCount:
      typeof layer.featureCount === 'number' && Number.isFinite(layer.featureCount)
        ? Math.max(0, Math.trunc(layer.featureCount))
        : 0,
    geometryType: geometryType || undefined,
    crs: 'EPSG:4326'
  }
}

function normalizeFeatureCollection(value: unknown, layerName: string): GeoJsonFeatureCollection {
  const record = asRecord(value)
  const features = record?.features
  if (record?.type !== 'FeatureCollection' || !Array.isArray(features)) {
    throw new Error(`Converted GeoJSON for layer "${layerName}" is not a FeatureCollection`)
  }

  return {
    type: 'FeatureCollection',
    features: features.map((feature) => normalizeFeature(feature, layerName))
  }
}

function normalizeFeature(feature: unknown, layerName: string): GeoJsonRecord {
  const record = asRecord(feature)
  if (!record) {
    throw new Error(`Converted GeoJSON for layer "${layerName}" contains an invalid feature`)
  }

  const properties = asRecord(record.properties)
  return {
    ...record,
    properties: properties ?? {}
  }
}

function mergeFeatureCollections(
  layers: ConvertedLayer[],
  mergedLayerPropertyName?: string
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: layers.flatMap(({ layerName, collection }) =>
      collection.features.map((feature) =>
        mergedLayerPropertyName
          ? appendMergedLayerProperty(feature, mergedLayerPropertyName, layerName)
          : feature
      )
    )
  }
}

function appendMergedLayerProperty(
  feature: GeoJsonRecord,
  mergedLayerPropertyName: string,
  layerName: string
): GeoJsonRecord {
  const properties = asRecord(feature.properties) ?? {}

  return {
    ...feature,
    properties: {
      ...properties,
      [mergedLayerPropertyName]: layerName
    }
  }
}

function pickMergedLayerPropertyName(layers: ConvertedLayer[]): string {
  let suffix = 0

  while (true) {
    const candidate =
      suffix === 0
        ? DEFAULT_MERGED_LAYER_PROPERTY_NAME
        : `${DEFAULT_MERGED_LAYER_PROPERTY_NAME}_${suffix}`

    const isTaken = layers.some(({ collection }) =>
      collection.features.some((feature) => {
        const properties = asRecord(feature.properties)
        return Boolean(properties && candidate in properties)
      })
    )

    if (!isTaken) {
      return candidate
    }

    suffix += 1
  }
}

function asRecord(value: unknown): GeoJsonRecord | null {
  return value && typeof value === 'object' ? (value as GeoJsonRecord) : null
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  )
}

async function assertReadableFile(path: string): Promise<void> {
  let stats
  try {
    stats = await fs.stat(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new Error('GeoPackage source file was not found')
    }

    throw error
  }

  if (!stats.isFile()) {
    throw new Error('GeoPackage source path does not point to a file')
  }
}

let geoPackageImportService: GeoPackageImportService | null = null

export function getGeoPackageImportService(): GeoPackageImportService {
  if (!geoPackageImportService) {
    geoPackageImportService = new GeoPackageImportService()
  }

  return geoPackageImportService
}
