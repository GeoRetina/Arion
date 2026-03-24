import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerCreateInput } from '../../../shared/types/layer-types'
import { QgisOutputInspector } from './qgis-output-inspector'

describe('QgisOutputInspector', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arion-qgis-output-'))
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('summarizes imported vector layers without re-inspecting the artifact', async () => {
    const geoPackageImportService = {
      importFile: vi.fn()
    }
    const rasterTileService = {
      registerGeoTiffAsset: vi.fn(),
      releaseGeoTiffAsset: vi.fn()
    }
    const inspector = new QgisOutputInspector({
      geoPackageImportService: geoPackageImportService as never,
      rasterTileService: rasterTileService as never
    })

    const importedLayer: LayerCreateInput = {
      name: 'buffer-output',
      type: 'vector',
      sourceId: 'source-buffer-output',
      sourceConfig: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      },
      style: {},
      visibility: true,
      opacity: 1,
      zIndex: 0,
      metadata: {
        tags: ['qgis'],
        featureCount: 42,
        geometryType: 'Polygon',
        bounds: [-79.4, 43.6, -79.2, 43.8],
        attributes: {
          id: {
            type: 'number',
            nullable: false
          }
        }
      },
      isLocked: false,
      createdBy: 'import'
    }

    const outputs = await inspector.summarizeArtifacts(
      [
        {
          path: 'E:\\outputs\\buffer.geojson',
          kind: 'vector',
          exists: true,
          selectedForImport: true,
          imported: true
        }
      ],
      [
        {
          path: 'E:\\outputs\\buffer.geojson',
          layer: importedLayer
        }
      ]
    )

    expect(outputs).toEqual([
      {
        path: 'E:\\outputs\\buffer.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true,
        imported: true,
        layer: {
          name: 'buffer-output',
          type: 'vector',
          sourceType: 'geojson',
          sourceId: 'source-buffer-output',
          metadata: {
            tags: ['qgis'],
            featureCount: 42,
            geometryType: 'Polygon',
            bounds: [-79.4, 43.6, -79.2, 43.8],
            attributeKeys: ['id']
          }
        }
      }
    ])

    expect(geoPackageImportService.importFile).not.toHaveBeenCalled()
    expect(rasterTileService.registerGeoTiffAsset).not.toHaveBeenCalled()
  })

  it('inspects GeoJSON artifacts when they were not auto-imported', async () => {
    const artifactPath = path.join(tempRoot, 'analysis.geojson')
    await fs.writeFile(
      artifactPath,
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-79.38, 43.65]
            },
            properties: {
              id: 1,
              name: 'Downtown'
            }
          }
        ]
      }),
      'utf8'
    )

    const inspector = new QgisOutputInspector({
      geoPackageImportService: {
        importFile: vi.fn()
      } as never,
      rasterTileService: {
        registerGeoTiffAsset: vi.fn(),
        releaseGeoTiffAsset: vi.fn()
      } as never
    })

    const outputs = await inspector.summarizeArtifacts(
      [
        {
          path: artifactPath,
          kind: 'vector',
          exists: true,
          selectedForImport: false,
          imported: false
        }
      ],
      []
    )

    expect(outputs).toEqual([
      {
        path: artifactPath,
        kind: 'vector',
        exists: true,
        selectedForImport: false,
        imported: false,
        layer: {
          name: 'analysis',
          type: 'vector',
          sourceType: 'geojson',
          metadata: {
            description: 'Imported GeoJSON file with 1 features',
            tags: ['imported', 'geojson'],
            geometryType: 'Point',
            featureCount: 1,
            bounds: [-79.38, 43.65, -79.38, 43.65],
            crs: 'EPSG:4326',
            attributeKeys: ['id', 'name']
          }
        }
      }
    ])
  })

  it('summarizes raster artifacts through the managed raster import pipeline', async () => {
    const registerGeoTiffAsset = vi.fn(async () => ({
      assetId: 'asset-1',
      tilesUrlTemplate: 'arion-raster://tiles/asset-1/{z}/{x}/{y}.png',
      bounds: [-80, 40, -78, 42],
      sourceBounds: [0, 0, 1000, 1000],
      crs: 'EPSG:3857' as const,
      width: 2048,
      height: 1024,
      bandCount: 4,
      minZoom: 0,
      maxZoom: 12,
      processingEngine: 'gdal' as const,
      processingWarning: 'Reprojected to supported CRS'
    }))
    const releaseGeoTiffAsset = vi.fn(async () => undefined)

    const inspector = new QgisOutputInspector({
      geoPackageImportService: {
        importFile: vi.fn()
      } as never,
      rasterTileService: {
        registerGeoTiffAsset,
        releaseGeoTiffAsset
      } as never
    })

    const outputs = await inspector.summarizeArtifacts(
      [
        {
          path: 'E:\\outputs\\surface.tif',
          kind: 'raster',
          exists: true,
          selectedForImport: false,
          imported: false
        }
      ],
      []
    )

    expect(outputs).toEqual([
      {
        path: 'E:\\outputs\\surface.tif',
        kind: 'raster',
        exists: true,
        selectedForImport: false,
        imported: false,
        layer: {
          name: 'surface',
          type: 'raster',
          sourceType: 'raster',
          metadata: {
            description: 'Imported GeoTIFF output surface',
            tags: ['imported', 'geotiff', 'gdal', 'raster-warning'],
            bounds: [-80, 40, -78, 42],
            crs: 'EPSG:3857',
            raster: {
              bandCount: 4,
              width: 2048,
              height: 1024,
              minZoom: 0,
              maxZoom: 12,
              sourceBounds: [0, 0, 1000, 1000],
              processingEngine: 'gdal',
              processingWarning: 'Reprojected to supported CRS'
            }
          }
        }
      }
    ])

    expect(registerGeoTiffAsset).toHaveBeenCalledWith({
      sourcePath: 'E:\\outputs\\surface.tif'
    })
    expect(releaseGeoTiffAsset).toHaveBeenCalledWith('asset-1')
  })
})
