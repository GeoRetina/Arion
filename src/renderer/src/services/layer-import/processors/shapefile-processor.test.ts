import { describe, expect, it, vi } from 'vitest'
import { ShapefileProcessor } from './shapefile-processor'

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

describe('ShapefileProcessor', () => {
  it('uses a managed asset when the shapefile archive resolves to a local path', async () => {
    resolveLocalImportFilePath.mockResolvedValue('C:\\data\\roads.zip')
    registerVectorAsset.mockResolvedValue({
      assetId: 'vector-asset-shapefile',
      dataUrl: 'arion-vector://assets/vector-asset-shapefile.geojson',
      metadata: {
        description: 'Imported Shapefile with 1 features',
        tags: ['imported', 'shapefile'],
        source: 'C:\\data\\roads.zip',
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
          localFilePath: 'C:\\data\\roads.zip'
        }
      },
      featureCount: 1
    })

    const file = {
      arrayBuffer: vi.fn()
    } as unknown as File

    const layer = await ShapefileProcessor.processFile(file, 'roads.zip')

    expect(registerVectorAsset).toHaveBeenCalledWith({
      sourcePath: 'C:\\data\\roads.zip',
      format: 'shapefile'
    })
    expect(file.arrayBuffer).not.toHaveBeenCalled()
    expect(layer.sourceConfig).toMatchObject({
      type: 'geojson',
      data: 'arion-vector://assets/vector-asset-shapefile.geojson',
      options: {
        vectorAssetId: 'vector-asset-shapefile',
        vectorSourcePath: 'C:\\data\\roads.zip'
      }
    })
    expect(layer.metadata.context).toMatchObject({
      localFilePath: 'C:\\data\\roads.zip'
    })
  })
})
