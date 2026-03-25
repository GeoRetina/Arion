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

  it('assigns newly added layers the next top z-index when imports default to zero', async () => {
    const firstLayerId = await useLayerStore.getState().addLayer({
      name: 'First import',
      type: 'vector',
      sourceId: 'source-first',
      sourceConfig: {
        type: 'geojson',
        data: 'arion-vector://assets/first.geojson',
        options: {
          vectorAssetId: 'asset-first'
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

    const secondLayerId = await useLayerStore.getState().addLayer({
      name: 'Second import',
      type: 'vector',
      sourceId: 'source-second',
      sourceConfig: {
        type: 'geojson',
        data: 'arion-vector://assets/second.geojson',
        options: {
          vectorAssetId: 'asset-second'
        }
      },
      style: {
        lineColor: '#2563eb'
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

    expect(layerApiMocks.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: firstLayerId,
        zIndex: 0
      })
    )
    expect(layerApiMocks.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: secondLayerId,
        zIndex: 1
      })
    )

    const layers = useLayerStore.getState().getLayers()
    expect(layers.map((layer) => layer.id)).toEqual([secondLayerId, firstLayerId])
    expect(useLayerStore.getState().getLayer(firstLayerId)?.zIndex).toBe(0)
    expect(useLayerStore.getState().getLayer(secondLayerId)?.zIndex).toBe(1)
  })

  it('filters and sorts session-imported layers through the store selector', () => {
    const earlier = new Date('2026-03-21T00:00:00.000Z')
    const later = new Date('2026-03-21T00:05:00.000Z')
    const chatALow = createLayer({
      id: 'chat-a-low',
      zIndex: 1,
      createdAt: earlier,
      updatedAt: earlier,
      metadata: {
        tags: ['session-import', 'chat-a']
      }
    })
    const chatAHigh = createLayer({
      id: 'chat-a-high',
      zIndex: 3,
      createdAt: later,
      updatedAt: later,
      metadata: {
        tags: ['session-import', 'chat-a']
      }
    })
    const chatBLayer = createLayer({
      id: 'chat-b-layer',
      zIndex: 2,
      metadata: {
        tags: ['session-import', 'chat-b']
      }
    })
    const persistentLayer = createLayer({
      id: 'persistent-layer',
      createdBy: 'user',
      metadata: {
        tags: ['persistent']
      }
    })

    useLayerStore.setState({
      layers: new Map([
        [chatALow.id, chatALow],
        [chatAHigh.id, chatAHigh],
        [chatBLayer.id, chatBLayer],
        [persistentLayer.id, persistentLayer]
      ])
    })

    expect(
      useLayerStore
        .getState()
        .getSessionImportedLayers('chat-a')
        .map((layer) => layer.id)
    ).toEqual(['chat-a-high', 'chat-a-low'])
    expect(
      useLayerStore
        .getState()
        .getSessionImportedLayers()
        .map((layer) => layer.id)
    ).toEqual(['chat-a-high', 'chat-b-layer', 'chat-a-low'])
  })

  it('tags only previously unassigned imported layers for the active chat', async () => {
    const untaggedImport = createLayer({
      id: 'untagged-import',
      metadata: {
        tags: ['imported']
      }
    })
    const alreadyTagged = createLayer({
      id: 'already-tagged',
      metadata: {
        tags: ['imported', 'session-import', 'chat-a']
      }
    })
    const otherSession = createLayer({
      id: 'other-session',
      metadata: {
        tags: ['imported', 'session-import', 'chat-b']
      }
    })

    useLayerStore.setState({
      layers: new Map([
        [untaggedImport.id, untaggedImport],
        [alreadyTagged.id, alreadyTagged],
        [otherSession.id, otherSession]
      ])
    })

    await useLayerStore.getState().tagImportedLayersForChat('chat-a')

    expect(useLayerStore.getState().getLayer('untagged-import')?.metadata.tags).toEqual([
      'imported',
      'session-import',
      'chat-a'
    ])
    expect(useLayerStore.getState().getLayer('already-tagged')?.metadata.tags).toEqual([
      'imported',
      'session-import',
      'chat-a'
    ])
    expect(useLayerStore.getState().getLayer('other-session')?.metadata.tags).toEqual([
      'imported',
      'session-import',
      'chat-b'
    ])
  })

  it('resets vector styles through LayerStyleFactory defaults without reintroducing polygon fill props on line layers', async () => {
    const lineLayer = createLayer({
      id: 'line-layer',
      metadata: {
        tags: ['imported'],
        geometryType: 'LineString'
      },
      style: {
        lineColor: '#22c55e',
        lineWidth: 7,
        lineOpacity: 0.2,
        fillColor: '#ef4444',
        fillOpacity: 0.9
      }
    })

    useLayerStore.setState({
      layers: new Map([[lineLayer.id, lineLayer]])
    })

    await useLayerStore.getState().resetLayerStyle(lineLayer.id)

    expect(useLayerStore.getState().getLayer(lineLayer.id)?.style).toEqual({
      textSize: 12,
      textColor: '#000000',
      textHaloColor: '#ffffff',
      textHaloWidth: 1,
      lineColor: '#22c55e',
      lineWidth: 2,
      lineOpacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round'
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
