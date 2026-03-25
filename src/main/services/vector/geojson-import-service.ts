import { promises as fs } from 'fs'
import type { LayerMetadata } from '../../../shared/types/layer-types'
import {
  normalizeGeoJson,
  type GeoJsonFeatureCollection
} from '../../../shared/lib/vector-import-utils'
import { asRecord } from '../../../shared/lib/as-record'
import { getGdalRunnerService, type GdalRunnerService } from '../raster/gdal-runner-service'

const OGR2OGR_TIMEOUT_MS = 2 * 60 * 1000
const OGR_STDOUT_PATH = '/vsistdout/'
const TARGET_MAP_CRS = 'EPSG:4326'

export interface GeoJsonImportResult {
  geojson: GeoJsonFeatureCollection
  sourceCrs?: string
  importWarnings: string[]
}

export class GeoJsonImportService {
  constructor(
    private readonly gdalRunner: Pick<
      GdalRunnerService,
      'getAvailability' | 'run'
    > = getGdalRunnerService()
  ) {}

  async importFile(sourcePath: string): Promise<GeoJsonImportResult> {
    const rawContents = await fs.readFile(sourcePath, 'utf8')

    let parsed: unknown
    try {
      parsed = JSON.parse(rawContents)
    } catch (error) {
      throw new Error(
        `Failed to parse GeoJSON output "${sourcePath}": ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const sourceCrs = extractGeoJsonCrs(parsed)
    if (sourceCrs && !isWgs84EquivalentCrs(sourceCrs)) {
      return {
        geojson: await this.reprojectToMapCrs(sourcePath, sourceCrs),
        sourceCrs,
        importWarnings: [`Reprojected GeoJSON from ${sourceCrs} to ${TARGET_MAP_CRS}.`]
      }
    }

    return {
      geojson: normalizeGeoJson(parsed),
      sourceCrs,
      importWarnings: []
    }
  }

  private async reprojectToMapCrs(
    sourcePath: string,
    sourceCrs: string
  ): Promise<GeoJsonFeatureCollection> {
    const availability = await this.gdalRunner.getAvailability()
    if (!availability.available) {
      throw new Error(
        `GeoJSON source uses ${sourceCrs}. GDAL is required to reproject it to ${TARGET_MAP_CRS} for map display.`
      )
    }

    const result = await this.gdalRunner.run(
      'ogr2ogr',
      [
        '-f',
        'GeoJSON',
        '-lco',
        'RFC7946=YES',
        '-t_srs',
        TARGET_MAP_CRS,
        OGR_STDOUT_PATH,
        sourcePath
      ],
      {
        timeoutMs: OGR2OGR_TIMEOUT_MS
      }
    )

    let reprojectedPayload: unknown
    try {
      reprojectedPayload = JSON.parse(result.stdout)
    } catch {
      throw new Error(`Failed to parse reprojected GeoJSON output for "${sourcePath}"`)
    }

    return normalizeGeoJson(reprojectedPayload)
  }
}

export function applyGeoJsonImportContext(
  metadata: LayerMetadata,
  importResult: Pick<GeoJsonImportResult, 'sourceCrs' | 'importWarnings'>
): LayerMetadata {
  const nextMetadata: LayerMetadata = {
    ...metadata,
    context: {
      ...(metadata.context || {}),
      ...(importResult.sourceCrs ? { sourceCrs: importResult.sourceCrs } : {}),
      ...(importResult.importWarnings.length > 0
        ? { importWarnings: importResult.importWarnings }
        : {})
    }
  }

  if (importResult.importWarnings.length > 0) {
    nextMetadata.tags = Array.from(new Set([...(metadata.tags || []), 'reprojected']))
  }

  return nextMetadata
}

function extractGeoJsonCrs(value: unknown): string | undefined {
  const record = asRecord(value)
  if (!record) {
    return undefined
  }

  const crsValue = record.crs
  if (typeof crsValue === 'string' && crsValue.trim().length > 0) {
    return normalizeCrsName(crsValue)
  }

  const crsRecord = asRecord(crsValue)
  const properties = asRecord(crsRecord?.properties)
  const nameCandidate = readString(properties?.name, properties?.code, crsRecord?.name)
  return nameCandidate ? normalizeCrsName(nameCandidate) : undefined
}

function normalizeCrsName(value: string): string {
  const trimmedValue = value.trim()
  const upperValue = trimmedValue.toUpperCase()

  const epsgMatch = upperValue.match(/EPSG[:/]{1,2}(\d+)$/u) ?? upperValue.match(/EPSG:(\d+)/u)
  if (epsgMatch?.[1]) {
    return `EPSG:${epsgMatch[1]}`
  }

  if (upperValue.includes('CRS84')) {
    return 'OGC:CRS84'
  }

  return trimmedValue
}

function isWgs84EquivalentCrs(crs: string): boolean {
  const normalizedValue = crs.trim().toUpperCase()
  return (
    normalizedValue === 'EPSG:4326' ||
    normalizedValue === 'OGC:CRS84' ||
    normalizedValue.includes('CRS84') ||
    normalizedValue.includes('WGS84')
  )
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

export const __testing = {
  extractGeoJsonCrs,
  isWgs84EquivalentCrs,
  normalizeCrsName
}
