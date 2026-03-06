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
    layerApiMocks.create.mockResolvedValue(undefined)
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
})
