import { describe, expect, it, vi } from 'vitest'
import { GeoJSONProcessor } from './geojson-processor'

const { resolveLocalImportFilePath } = vi.hoisted(() => ({
  resolveLocalImportFilePath: vi.fn()
}))

const registerVectorAsset = vi.fn()

vi.mock('./local-import-file-path', () => ({
  resolveLocalImportFilePath
}))

Object.defineProperty(globalThis, 'window', {
  value: {
    ctg: {
      layers: {
        registerVectorAsset
      }
    }
  },
  configurable: true
})

describe('GeoJSONProcessor', () => {
  it('uses a managed asset when the import file can be resolved locally', async () => {
    resolveLocalImportFilePath.mockResolvedValue('C:\\data\\roads.geojson')
    registerVectorAsset.mockResolvedValue({
      assetId: 'vector-asset-geojson',
      dataUrl: 'arion-vector://assets/vector-asset-geojson.geojson',
      metadata: {
        description: 'Imported GeoJSON with 1 features',
        tags: ['imported', 'geojson'],
        source: 'C:\\data\\roads.geojson',
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
          localFilePath: 'C:\\data\\roads.geojson'
        }
      },
      featureCount: 1
    })

    const file = {
      text: vi.fn()
    } as unknown as File

    const layer = await GeoJSONProcessor.processFile(file, 'roads.geojson')

    expect(registerVectorAsset).toHaveBeenCalledWith({
      sourcePath: 'C:\\data\\roads.geojson',
      format: 'geojson'
    })
    expect(file.text).not.toHaveBeenCalled()
    expect(layer.sourceConfig).toMatchObject({
      type: 'geojson',
      data: 'arion-vector://assets/vector-asset-geojson.geojson',
      options: {
        vectorAssetId: 'vector-asset-geojson',
        vectorSourcePath: 'C:\\data\\roads.geojson'
      }
    })
    expect(layer.metadata.context).toMatchObject({
      localFilePath: 'C:\\data\\roads.geojson'
    })
  })

  it('falls back to inline GeoJSON when a local import path is unavailable', async () => {
    resolveLocalImportFilePath.mockResolvedValue(null)
    registerVectorAsset.mockReset()

    const file = {
      text: vi.fn(async () =>
        JSON.stringify({
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
        })
      )
    } as unknown as File

    const layer = await GeoJSONProcessor.processFile(file, 'roads.geojson')

    expect(layer.sourceConfig.data).toMatchObject({
      type: 'FeatureCollection'
    })
    expect(layer.metadata.context).toBeUndefined()
  })
})
