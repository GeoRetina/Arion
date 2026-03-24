import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeopackageProcessor } from './geopackage-processor'

const { resolveLocalImportFilePath } = vi.hoisted(() => ({
  resolveLocalImportFilePath: vi.fn()
}))

vi.mock('./local-import-file-path', () => ({
  resolveLocalImportFilePath
}))

describe('GeopackageProcessor', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    resolveLocalImportFilePath.mockReset()
    ;(globalThis as typeof globalThis & { window?: Window }).window = {
      ctg: {
        layers: {
          registerVectorAsset: vi.fn(async () => ({
            assetId: 'vector-asset-123',
            dataUrl: 'arion-vector://assets/vector-asset-123.geojson',
            metadata: {
              description: 'Imported GeoPackage with 1 features',
              tags: ['imported', 'geopackage'],
              source: 'geopackage-import',
              geometryType: 'LineString',
              featureCount: 1,
              bounds: [0, 0, 1, 1],
              crs: 'EPSG:4326',
              attributes: {
                name: {
                  type: 'string',
                  nullable: false
                }
              },
              context: {
                localFilePath: 'C:\\data\\roads.gpkg'
              }
            },
            featureCount: 1
          })),
          importGeoPackage: vi.fn(async () => ({
            geojson: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [0, 0],
                      [1, 1]
                    ]
                  },
                  properties: {
                    name: 'Main St'
                  }
                }
              ]
            },
            featureCount: 1,
            layerCount: 1,
            sourceLayers: [
              {
                name: 'roads',
                geometryType: 'LineString',
                featureCount: 1
              }
            ],
            warnings: [],
            mergedLayerPropertyName: '__gpkg_layer'
          }))
        }
      }
    } as never
  })

  afterEach(() => {
    ;(globalThis as typeof globalThis & { window?: Window }).window = originalWindow
  })

  it('stores the local source path in layer metadata for imported geopackages', async () => {
    resolveLocalImportFilePath.mockResolvedValue('C:\\data\\roads.gpkg')

    const file = {} as File
    const layer = await GeopackageProcessor.processFile(file, 'roads.gpkg')

    expect(layer.sourceConfig).toMatchObject({
      type: 'geojson',
      data: 'arion-vector://assets/vector-asset-123.geojson',
      options: {
        vectorAssetId: 'vector-asset-123',
        vectorSourcePath: 'C:\\data\\roads.gpkg'
      }
    })
    expect(layer.metadata.context).toMatchObject({
      localFilePath: 'C:\\data\\roads.gpkg'
    })
  })
})
