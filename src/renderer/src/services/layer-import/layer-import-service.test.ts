import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LayerImportService } from './layer-import-service'

const layerApiMocks = vi.hoisted(() => ({
  importLocalLayer: vi.fn(),
  resolveImportFilePath: vi.fn(),
  getGeoTiffAssetStatus: vi.fn(),
  releaseGeoTiffAsset: vi.fn()
}))

Object.defineProperty(globalThis, 'window', {
  value: {
    ctg: {
      layers: layerApiMocks
    }
  },
  configurable: true
})

describe('LayerImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates GeoJSON imports to the shared main-process local-path importer', async () => {
    layerApiMocks.resolveImportFilePath.mockResolvedValue('C:\\data\\roads.geojson')
    layerApiMocks.importLocalLayer.mockResolvedValue({
      name: 'roads',
      type: 'vector',
      sourceId: 'source-roads',
      sourceConfig: {
        type: 'geojson',
        data: 'arion-vector://assets/roads.geojson',
        options: {
          vectorAssetId: 'asset-roads',
          vectorSourcePath: 'C:\\data\\roads.geojson'
        }
      },
      style: {
        lineColor: '#22c55e'
      },
      visibility: true,
      opacity: 1,
      zIndex: 0,
      metadata: {
        tags: ['imported', 'geojson'],
        featureCount: 12
      },
      isLocked: false,
      createdBy: 'import'
    })

    const file = new File(['{"type":"FeatureCollection","features":[]}'], 'roads.geojson', {
      type: 'application/geo+json'
    })

    const layer = await LayerImportService.processFile(file, 'geojson')

    expect(layerApiMocks.importLocalLayer).toHaveBeenCalledWith({
      sourcePath: 'C:\\data\\roads.geojson',
      layerName: 'roads'
    })
    expect(layer.sourceId).toBe('source-roads')
    expect(layer.id).toEqual(expect.any(String))
    expect(layer.createdAt).toBeInstanceOf(Date)
    expect(layer.updatedAt).toBeInstanceOf(Date)
  })

  it('requires a resolved local file path and does not fall back to inline parsing', async () => {
    layerApiMocks.resolveImportFilePath.mockResolvedValue(null)

    const file = new File(['{"type":"FeatureCollection","features":[]}'], 'roads.geojson', {
      type: 'application/geo+json'
    })

    await expect(LayerImportService.processFile(file, 'geojson')).rejects.toThrow(
      'GeoJSON import requires a local file path'
    )
    expect(layerApiMocks.importLocalLayer).not.toHaveBeenCalled()
  })
})
