import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __testing,
  GeoJsonImportService,
  applyGeoJsonImportContext
} from './geojson-import-service'

describe('GeoJsonImportService', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-geojson-import-'))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('keeps WGS84 GeoJSON as-is without invoking GDAL', async () => {
    const sourcePath = path.join(tempRoot, 'roads.geojson')
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-73.7, 45.5],
                [-73.6, 45.6]
              ]
            },
            properties: {}
          }
        ]
      }),
      'utf8'
    )

    const gdalRunner = {
      getAvailability: vi.fn(),
      run: vi.fn()
    }
    const service = new GeoJsonImportService(gdalRunner as never)

    const result = await service.importFile(sourcePath)

    expect(result.sourceCrs).toBeUndefined()
    expect(result.importWarnings).toEqual([])
    expect(result.geojson.features).toHaveLength(1)
    expect(gdalRunner.getAvailability).not.toHaveBeenCalled()
    expect(gdalRunner.run).not.toHaveBeenCalled()
  })

  it('reprojects GeoJSON with a non-WGS84 CRS before map import', async () => {
    const sourcePath = path.join(tempRoot, 'projected.geojson')
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        type: 'FeatureCollection',
        name: 'top_10_longest_roads',
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:EPSG::3979'
          }
        },
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [1664137.36, -88522.36],
                  [1664158.98, -88411.63]
                ]
              ]
            },
            properties: {}
          }
        ]
      }),
      'utf8'
    )

    const gdalRunner = {
      getAvailability: vi.fn(async () => ({
        available: true
      })),
      run: vi.fn(async () => ({
        stdout: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [-73.7408, 45.51895],
                    [-73.74087, 45.51898]
                  ]
                ]
              },
              properties: {}
            }
          ]
        })
      }))
    }
    const service = new GeoJsonImportService(gdalRunner as never)

    const result = await service.importFile(sourcePath)

    expect(result.sourceCrs).toBe('EPSG:3979')
    expect(result.importWarnings).toEqual(['Reprojected GeoJSON from EPSG:3979 to EPSG:4326.'])
    expect(gdalRunner.getAvailability).toHaveBeenCalledTimes(1)
    expect(gdalRunner.run).toHaveBeenCalledWith(
      'ogr2ogr',
      ['-f', 'GeoJSON', '-lco', 'RFC7946=YES', '-t_srs', 'EPSG:4326', '/vsistdout/', sourcePath],
      {
        timeoutMs: 120000
      }
    )
    expect(result.geojson.features[0]?.geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [-73.7408, 45.51895],
          [-73.74087, 45.51898]
        ]
      ]
    })
  })

  it('fails clearly when projected GeoJSON needs GDAL but GDAL is unavailable', async () => {
    const sourcePath = path.join(tempRoot, 'projected.geojson')
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        type: 'FeatureCollection',
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:3979'
          }
        },
        features: []
      }),
      'utf8'
    )

    const service = new GeoJsonImportService({
      getAvailability: vi.fn(async () => ({
        available: false,
        reason: 'GDAL not installed'
      })),
      run: vi.fn()
    } as never)

    await expect(service.importFile(sourcePath)).rejects.toThrow(
      'GeoJSON source uses EPSG:3979. GDAL is required to reproject it to EPSG:4326 for map display.'
    )
  })
})

describe('geojson CRS helpers', () => {
  it('normalizes EPSG URNs and recognizes WGS84-equivalent CRSs', () => {
    expect(__testing.normalizeCrsName('urn:ogc:def:crs:EPSG::3979')).toBe('EPSG:3979')
    expect(__testing.normalizeCrsName('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe('OGC:CRS84')
    expect(__testing.isWgs84EquivalentCrs('EPSG:4326')).toBe(true)
    expect(__testing.isWgs84EquivalentCrs('OGC:CRS84')).toBe(true)
    expect(__testing.isWgs84EquivalentCrs('EPSG:3979')).toBe(false)
  })

  it('adds import warnings and source CRS into metadata context', () => {
    const updatedMetadata = applyGeoJsonImportContext(
      {
        tags: ['imported', 'geojson'],
        context: {
          localFilePath: 'C:\\data\\roads.geojson'
        }
      },
      {
        sourceCrs: 'EPSG:3979',
        importWarnings: ['Reprojected GeoJSON from EPSG:3979 to EPSG:4326.']
      }
    )

    expect(updatedMetadata.tags).toEqual(['imported', 'geojson', 'reprojected'])
    expect(updatedMetadata.context).toEqual({
      localFilePath: 'C:\\data\\roads.geojson',
      sourceCrs: 'EPSG:3979',
      importWarnings: ['Reprojected GeoJSON from EPSG:3979 to EPSG:4326.']
    })
  })
})
