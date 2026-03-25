import { describe, expect, it, vi } from 'vitest'
import type { LayerDefinition } from '../../../shared/types/layer-types'
import { MapLibreIntegration } from './maplibre-integration'

vi.mock('../lib/map-style-application', () => ({
  applyLayerStyleToMap: vi.fn()
}))

type MapEventName = 'style.load' | 'idle'

class MockMapLibreMap {
  private listeners = new Map<MapEventName, Set<() => void>>()
  private styleLoaded = true
  private sourceAddCount = 0
  private readonly sources = new Map<string, unknown>()
  private readonly layers = new Map<string, { id: string; type: string; source?: string }>()

  constructor() {
    this.sources.set('basemap-source', { type: 'raster' })
    this.layers.set('basemap-layer', {
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap-source'
    })
  }

  on(event: MapEventName, listener: () => void): this {
    const listeners = this.listeners.get(event) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  off(event: MapEventName, listener: () => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: MapEventName): void {
    Array.from(this.listeners.get(event) ?? []).forEach((listener) => listener())
  }

  isStyleLoaded(): boolean {
    return this.styleLoaded
  }

  getStyle(): {
    sources: Record<string, unknown>
    layers: Array<{ id: string; type: string; source?: string }>
  } {
    return {
      sources: Object.fromEntries(this.sources.entries()),
      layers: Array.from(this.layers.values())
    }
  }

  getSource(sourceId: string): unknown {
    return this.sources.get(sourceId)
  }

  addSource(sourceId: string, sourceSpec: unknown): void {
    this.sources.set(sourceId, sourceSpec)
    this.sourceAddCount += 1

    if (this.sourceAddCount === 1) {
      this.styleLoaded = false
    }
  }

  getLayer(layerId: string): unknown {
    return this.layers.get(layerId)
  }

  addLayer(layerSpec: { id: string; type: string; source?: string }): void {
    this.layers.set(layerSpec.id, layerSpec)
  }

  setLayoutProperty(): void {
    void 0
  }

  setPaintProperty(): void {
    void 0
  }
}

const createRasterLayer = (id: string, sourceId: string): LayerDefinition => ({
  id,
  name: id,
  type: 'raster',
  sourceId,
  sourceConfig: {
    type: 'raster',
    data: `arion-raster://tiles/${sourceId}/{z}/{x}/{y}.png`
  },
  style: {
    rasterOpacity: 1
  },
  visibility: true,
  opacity: 1,
  zIndex: 0,
  metadata: {
    tags: []
  },
  isLocked: false,
  createdBy: 'import',
  createdAt: new Date('2026-03-25T00:00:00.000Z'),
  updatedAt: new Date('2026-03-25T00:00:00.000Z')
})

describe('MapLibreIntegration', () => {
  it('continues syncing later layers even if styleLoaded flips false after the first custom source', async () => {
    const map = new MockMapLibreMap()
    const integration = new MapLibreIntegration(map as never)
    const firstLayer = createRasterLayer('layer-1', 'source-1')
    const secondLayer = createRasterLayer('layer-2', 'source-2')

    await integration.syncLayerToMap(firstLayer)

    expect(map.isStyleLoaded()).toBe(false)
    expect(map.getLayer('layer-1-raster')).toBeTruthy()

    await integration.syncLayerToMap(secondLayer)

    expect(map.getLayer('layer-2-raster')).toBeTruthy()
    expect(integration.getManagedSources()).toEqual(new Set(['source-1', 'source-2']))
    expect(integration.getManagedLayers()).toEqual(new Set(['layer-1-raster', 'layer-2-raster']))
  })
})
