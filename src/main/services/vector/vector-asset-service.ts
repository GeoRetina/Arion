import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { app } from 'electron'
import type {
  RegisterVectorAssetRequest,
  RegisterVectorAssetResult
} from '../../../shared/ipc-types'
import {
  assertFeatureCollectionHasFeatures,
  buildGeoJsonMetadata,
  buildShapefileMetadata,
  normalizeGeoJson,
  normalizeShapefileOutput,
  type GeoJsonFeatureCollection
} from '../../../shared/lib/vector-import-utils'
import { ensureLocalFilesystemPath } from '../../security/path-security'
import {
  getGeoPackageImportService,
  type GeoPackageImportService
} from './geopackage-import-service'
import { buildGeoPackageLayerMetadata } from '../layers/local-layer-metadata-utils'
import { loadShapefileReaderInput, type ShapefileReaderInput } from './shapefile-source-loader'

const VECTOR_ASSETS_DIR = 'vector-assets'
const VALID_ASSET_ID_PATTERN = /^[a-f0-9-]{36}$/i

type ShapefileReader = (input: ShapefileReaderInput) => Promise<unknown>

let shapefileReaderPromise: Promise<ShapefileReader> | null = null

export class VectorAssetService {
  constructor(
    private readonly geoPackageImportService: GeoPackageImportService = getGeoPackageImportService()
  ) {}

  getAssetUrl(assetId: string): string {
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid vector asset id')
    }

    return `arion-vector://assets/${assetId}.geojson`
  }

  async registerVectorAsset(
    request: RegisterVectorAssetRequest
  ): Promise<RegisterVectorAssetResult> {
    await this.ensureAssetsDirectory()

    const sourcePath = ensureLocalFilesystemPath(request.sourcePath, 'Vector source path')

    switch (request.format) {
      case 'geojson':
        return await this.registerGeoJsonAsset(sourcePath)
      case 'shapefile':
        return await this.registerShapefileAsset(sourcePath)
      case 'geopackage':
        return await this.registerGeoPackageAsset(sourcePath)
      default:
        throw new Error(`Unsupported vector asset format: ${request.format}`)
    }
  }

  async readAsset(assetId: string): Promise<Buffer> {
    return await fs.readFile(this.getAssetPath(assetId))
  }

  async releaseVectorAsset(assetId: string): Promise<void> {
    if (!isValidAssetId(assetId)) {
      return
    }

    try {
      await fs.unlink(this.getAssetPath(assetId))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  private async ensureAssetsDirectory(): Promise<void> {
    await fs.mkdir(this.getAssetsDirectoryPath(), { recursive: true })
  }

  private async registerGeoJsonAsset(sourcePath: string): Promise<RegisterVectorAssetResult> {
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
    const metadata = buildGeoJsonMetadata(normalizedGeoJson, sourcePath)
    return await this.writeManagedAsset(normalizedGeoJson, metadata)
  }

  private async registerShapefileAsset(sourcePath: string): Promise<RegisterVectorAssetResult> {
    const shapefileInput = await loadShapefileReaderInput(sourcePath)

    let shpjsOutput: unknown
    try {
      const readShapefile = await getShapefileReader()
      shpjsOutput = await readShapefile(shapefileInput)
    } catch (error) {
      throw new Error(
        `Failed to parse shapefile dataset "${sourcePath}": ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const normalizedGeoJson = normalizeShapefileOutput(shpjsOutput)
    assertFeatureCollectionHasFeatures(normalizedGeoJson, 'Shapefile contains no features')
    const metadata = buildShapefileMetadata(normalizedGeoJson, sourcePath)
    return await this.writeManagedAsset(normalizedGeoJson, metadata)
  }

  private async registerGeoPackageAsset(sourcePath: string): Promise<RegisterVectorAssetResult> {
    const importResult = await this.geoPackageImportService.importFile(sourcePath)
    const metadata = buildGeoPackageLayerMetadata(importResult, sourcePath)
    return await this.writeManagedAsset(importResult.geojson, metadata)
  }

  private async writeManagedAsset(
    geoJson: GeoJsonFeatureCollection,
    metadata: RegisterVectorAssetResult['metadata']
  ): Promise<RegisterVectorAssetResult> {
    const assetId = randomUUID()
    const destinationPath = this.getAssetPath(assetId)

    await fs.writeFile(destinationPath, JSON.stringify(geoJson), 'utf8')

    return {
      assetId,
      dataUrl: this.getAssetUrl(assetId),
      metadata,
      featureCount: metadata.featureCount ?? geoJson.features.length
    }
  }

  private getAssetsDirectoryPath(): string {
    return join(app.getPath('userData'), VECTOR_ASSETS_DIR)
  }

  private getAssetPath(assetId: string): string {
    if (!isValidAssetId(assetId)) {
      throw new Error('Invalid vector asset id')
    }

    return join(this.getAssetsDirectoryPath(), `${assetId}.geojson`)
  }
}

function isValidAssetId(assetId: string): boolean {
  return VALID_ASSET_ID_PATTERN.test(assetId)
}

let vectorAssetService: VectorAssetService | null = null

export function getVectorAssetService(): VectorAssetService {
  if (!vectorAssetService) {
    vectorAssetService = new VectorAssetService()
  }

  return vectorAssetService
}

async function getShapefileReader(): Promise<ShapefileReader> {
  if (!shapefileReaderPromise) {
    shapefileReaderPromise = import('shpjs').then((module) => module.default)
  }

  return await shapefileReaderPromise
}
