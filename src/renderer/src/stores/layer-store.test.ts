import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/maplibre-integration', () => ({
  MapLibreIntegration: class {
    cleanup(): void {
      void 0
    }
  }
}))

const layerApiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(),
  releaseGeoTiffAsset: vi.fn(),
  updateRuntimeSnapshot: vi.fn(),
  groups: {
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn()
  }
}))

Object.defineProperty(globalThis, 'window', {
  value: {
    ctg: {
      layers: layerApiMocks
    }
  },
  configurable: true
})

import { useLayerStore } from './layer-store'

describe('layer-store addLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    layerApiMocks.create.mockImplementation(async (layer) => ({
      ...layer,
      id: layer.id ?? 'persisted-layer-id',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z')
    }))
    layerApiMocks.updateRuntimeSnapshot.mockResolvedValue(true)
    useLayerStore.getState().reset()
  })

  it('stores arbitrary context metadata under metadata.context before persistence', async () => {
    const layerId = await useLayerStore.getState().addLayer(
      {
        name: 'Raster import',
        type: 'raster',
        sourceId: 'source-1',
        sourceConfig: {
          type: 'raster',
          data: 'arion-raster://asset/{z}/{x}/{y}.png'
        },
        style: {
          rasterOpacity: 1
        },
        visibility: true,
        opacity: 1,
        zIndex: 0,
        metadata: {
          description: 'Imported raster',
          tags: ['imported']
        },
        isLocked: false,
        createdBy: 'import'
      },
      {
        chatId: 'chat-123',
        source: 'attach-button',
        metadata: {
          fileName: 'dem.tif',
          fileSize: 2048
        }
      }
    )

    expect(layerApiMocks.create).toHaveBeenCalledTimes(1)
    expect(layerApiMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: layerId,
        metadata: expect.objectContaining({
          tags: expect.arrayContaining([
            'imported',
            'session-import',
            'chat-123',
            'source:attach-button'
          ]),
          context: {
            fileName: 'dem.tif',
            fileSize: 2048
          }
        })
      })
    )

    expect(useLayerStore.getState().getLayer(layerId)?.metadata.context).toEqual({
      fileName: 'dem.tif',
      fileSize: 2048
    })
  })

  it('rebuilds the map source when a layer source config changes', async () => {
    const layerId = await useLayerStore.getState().addLayer({
      name: 'Multiband raster',
      type: 'raster',
      sourceId: 'source-2',
      sourceConfig: {
        type: 'raster',
        data: 'arion-raster://tiles/asset/{z}/{x}/{y}.png',
        options: {
          rasterAssetId: 'asset-123',
          rasterBandCount: 6
        }
      },
      style: {
        rasterOpacity: 1
      },
      visibility: true,
      opacity: 1,
      zIndex: 0,
      metadata: {
        description: 'Imported raster',
        tags: ['imported']
      },
      isLocked: false,
      createdBy: 'import'
    })

    const mockIntegration = {
      cleanup: vi.fn(),
      removeLayerFromMap: vi.fn().mockResolvedValue(undefined),
      syncLayerToMap: vi.fn().mockResolvedValue(undefined),
      syncLayerProperties: vi.fn().mockResolvedValue(undefined)
    }

    const updatedSourceConfig = {
      type: 'raster' as const,
      data: 'arion-raster://tiles/asset/{z}/{x}/{y}.png?rgb=4%2C3%2C2',
      options: {
        rasterAssetId: 'asset-123',
        rasterBandCount: 6,
        rasterRgbBands: {
          red: 4,
          green: 3,
          blue: 2
        }
      }
    }

    vi.clearAllMocks()
    layerApiMocks.update.mockResolvedValue({
      id: layerId,
      name: 'Multiband raster',
      type: 'raster',
      sourceId: 'source-2',
      sourceConfig: updatedSourceConfig,
      style: {
        rasterOpacity: 1
      },
      visibility: true,
      opacity: 1,
      zIndex: 0,
      metadata: {
        description: 'Imported raster',
        tags: ['imported']
      },
      isLocked: false,
      createdBy: 'import',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z')
    })
    layerApiMocks.updateRuntimeSnapshot.mockResolvedValue(true)
    useLayerStore.setState({
      mapLibreIntegration: mockIntegration as never
    })

    await useLayerStore.getState().updateLayer(layerId, {
      sourceConfig: updatedSourceConfig
    })

    expect(layerApiMocks.update).toHaveBeenCalledWith(layerId, {
      sourceConfig: updatedSourceConfig
    })
    expect(mockIntegration.removeLayerFromMap).toHaveBeenCalledWith(layerId)
    expect(mockIntegration.syncLayerToMap).toHaveBeenCalledWith(
      expect.objectContaining({
        id: layerId,
        sourceConfig: updatedSourceConfig
      })
    )
    expect(mockIntegration.syncLayerProperties).not.toHaveBeenCalled()
  })
})
