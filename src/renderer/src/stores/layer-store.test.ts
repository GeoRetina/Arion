import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerDefinition } from '../../../shared/types/layer-types'

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
  releaseVectorAsset: vi.fn(),
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

const createLayer = (
  overrides: Partial<LayerDefinition> & Pick<LayerDefinition, 'id'>
): LayerDefinition => ({
  id: overrides.id,
  name: overrides.name ?? 'Test layer',
  type: overrides.type ?? 'vector',
  sourceId: overrides.sourceId ?? `source-${overrides.id}`,
  sourceConfig: overrides.sourceConfig ?? {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  },
  style: overrides.style ?? {
    fillColor: '#22c55e'
  },
  visibility: overrides.visibility ?? true,
  opacity: overrides.opacity ?? 1,
  zIndex: overrides.zIndex ?? 0,
  metadata: overrides.metadata ?? {
    tags: []
  },
  groupId: overrides.groupId,
  isLocked: overrides.isLocked ?? false,
  createdBy: overrides.createdBy ?? 'import',
  createdAt: overrides.createdAt ?? new Date('2026-03-21T00:00:00.000Z'),
  updatedAt: overrides.updatedAt ?? new Date('2026-03-21T00:00:00.000Z')
})

describe('layer-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    layerApiMocks.create.mockImplementation(async (layer) => ({
      ...layer,
      id: layer.id ?? 'persisted-layer-id',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z')
    }))
    layerApiMocks.releaseGeoTiffAsset.mockResolvedValue(true)
    layerApiMocks.releaseVectorAsset.mockResolvedValue(true)
    layerApiMocks.updateRuntimeSnapshot.mockResolvedValue(true)
    layerApiMocks.getAll.mockResolvedValue([])
    layerApiMocks.groups.getAll.mockResolvedValue([])
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

  it('persists managed vector imports backed by protocol asset urls', async () => {
    const layerId = await useLayerStore.getState().addLayer({
      name: 'Managed vector import',
      type: 'vector',
      sourceId: 'source-managed-vector',
      sourceConfig: {
        type: 'geojson',
        data: 'arion-vector://assets/asset-123.geojson',
        options: {
          vectorAssetId: 'asset-123',
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
        tags: ['imported']
      },
      isLocked: false,
      createdBy: 'import'
    })

    expect(layerApiMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: layerId,
        sourceConfig: expect.objectContaining({
          data: 'arion-vector://assets/asset-123.geojson'
        })
      })
    )
  })
  it('clearSessionData removes imported layers from store state and the active map', () => {
    const importedLayer = createLayer({
      id: 'imported-raster',
      name: 'Imported raster',
      type: 'raster',
      sourceConfig: {
        type: 'raster',
        data: 'arion-raster://tiles/asset-123/{z}/{x}/{y}.png',
        options: {
          rasterAssetId: 'asset-123'
        }
      },
      createdBy: 'import',
      metadata: {
        tags: ['session-import', 'chat-a']
      }
    })
    const retainedLayer = createLayer({
      id: 'retained-user-layer',
      name: 'Retained user layer',
      createdBy: 'user',
      metadata: {
        tags: ['persistent']
      }
    })

    const mockIntegration = {
      cleanup: vi.fn(),
      removeLayerFromMap: vi.fn().mockResolvedValue(undefined),
      syncLayerToMap: vi.fn().mockResolvedValue(undefined),
      syncLayerProperties: vi.fn().mockResolvedValue(undefined)
    }

    useLayerStore.setState({
      layers: new Map([
        [importedLayer.id, importedLayer],
        [retainedLayer.id, retainedLayer]
      ]),
      selectedLayerId: importedLayer.id,
      operations: [
        { type: 'create', layerId: importedLayer.id, timestamp: new Date() },
        { type: 'create', layerId: retainedLayer.id, timestamp: new Date() }
      ],
      errors: [
        {
          code: 'SOURCE_LOAD_FAILED',
          message: 'Imported layer failed',
          layerId: importedLayer.id,
          timestamp: new Date()
        },
        {
          code: 'SOURCE_LOAD_FAILED',
          message: 'Retained layer failed',
          layerId: retainedLayer.id,
          timestamp: new Date()
        }
      ],
      mapLibreIntegration: mockIntegration as never
    })

    useLayerStore.getState().clearSessionData()

    const state = useLayerStore.getState()
    expect(Array.from(state.layers.keys())).toEqual([retainedLayer.id])
    expect(state.selectedLayerId).toBeNull()
    expect(state.operations.map((operation) => operation.layerId)).toEqual([retainedLayer.id])
    expect(state.errors.map((error) => error.layerId)).toEqual([retainedLayer.id])
    expect(mockIntegration.removeLayerFromMap).toHaveBeenCalledWith(importedLayer.id)
    expect(layerApiMocks.releaseGeoTiffAsset).not.toHaveBeenCalled()
  })

  it('clearSessionLayersForChat only removes layers from the target chat and keeps shared assets alive', () => {
    const chatALayer = createLayer({
      id: 'chat-a-raster',
      name: 'Chat A raster',
      type: 'raster',
      sourceConfig: {
        type: 'raster',
        data: 'arion-raster://tiles/shared-asset/{z}/{x}/{y}.png',
        options: {
          rasterAssetId: 'shared-asset'
        }
      },
      createdBy: 'import',
      metadata: {
        tags: ['session-import', 'chat-a']
      }
    })
    const chatBLayer = createLayer({
      id: 'chat-b-raster',
      name: 'Chat B raster',
      type: 'raster',
      sourceConfig: {
        type: 'raster',
        data: 'arion-raster://tiles/shared-asset/{z}/{x}/{y}.png',
        options: {
          rasterAssetId: 'shared-asset'
        }
      },
      createdBy: 'import',
      metadata: {
        tags: ['session-import', 'chat-b']
      }
    })

    const mockIntegration = {
      cleanup: vi.fn(),
      removeLayerFromMap: vi.fn().mockResolvedValue(undefined),
      syncLayerToMap: vi.fn().mockResolvedValue(undefined),
      syncLayerProperties: vi.fn().mockResolvedValue(undefined)
    }

    useLayerStore.setState({
      layers: new Map([
        [chatALayer.id, chatALayer],
        [chatBLayer.id, chatBLayer]
      ]),
      selectedLayerId: chatALayer.id,
      mapLibreIntegration: mockIntegration as never
    })

    useLayerStore.getState().clearSessionLayersForChat('chat-a')

    const state = useLayerStore.getState()
    expect(Array.from(state.layers.keys())).toEqual([chatBLayer.id])
    expect(state.selectedLayerId).toBeNull()
    expect(mockIntegration.removeLayerFromMap).toHaveBeenCalledWith(chatALayer.id)
    expect(mockIntegration.removeLayerFromMap).not.toHaveBeenCalledWith(chatBLayer.id)
    expect(layerApiMocks.releaseGeoTiffAsset).not.toHaveBeenCalled()
  })

  it('loadChatLayers restores only imported layers tagged for the active chat', async () => {
    const persistentLayer = createLayer({
      id: 'persistent-user-layer',
      createdBy: 'user',
      sourceConfig: {
        type: 'geojson',
        data: 'https://example.com/layer.geojson'
      },
      metadata: {
        tags: ['persistent']
      }
    })
    const chatALayer = createLayer({
      id: 'chat-a-import',
      type: 'vector',
      sourceConfig: {
        type: 'geojson',
        data: 'arion-vector://assets/chat-a.geojson',
        options: {
          vectorAssetId: 'chat-a-asset'
        }
      },
      createdBy: 'import',
      metadata: {
        tags: ['session-import', 'chat-a']
      }
    })
    const chatBLayer = createLayer({
      id: 'chat-b-import',
      type: 'raster',
      sourceConfig: {
        type: 'raster',
        data: 'arion-raster://tiles/chat-b/{z}/{x}/{y}.png',
        options: {
          rasterAssetId: 'chat-b-asset'
        }
      },
      createdBy: 'import',
      metadata: {
        tags: ['session-import', 'chat-b']
      }
    })

    layerApiMocks.getAll.mockResolvedValue([persistentLayer, chatALayer, chatBLayer])
    layerApiMocks.groups.getAll.mockResolvedValue([])

    await useLayerStore.getState().loadChatLayers('chat-a')

    const state = useLayerStore.getState()
    expect(Array.from(state.layers.keys())).toEqual([persistentLayer.id, chatALayer.id])
    expect(state.layers.get(chatALayer.id)).toEqual(chatALayer)
    expect(state.layers.has(chatBLayer.id)).toBe(false)
  })
})
