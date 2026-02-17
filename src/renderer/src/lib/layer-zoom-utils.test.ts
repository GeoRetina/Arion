import { describe, expect, it, vi } from 'vitest'
import { LayerZoomService, canZoomToLayer, zoomToLayer, zoomToLayers } from './layer-zoom-utils'
import type { LayerDefinition } from '../../../shared/types/layer-types'

const createLayer = (overrides: Partial<LayerDefinition> = {}): LayerDefinition => ({
  id: 'layer-1',
  name: 'Layer',
  type: 'vector',
  sourceId: 'source-1',
  sourceConfig: {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [10, 20]
      },
      properties: {}
    }
  },
  style: {},
  visibility: true,
  opacity: 1,
  zIndex: 0,
  metadata: {
    tags: [],
    geometryType: 'Point'
  },
  isLocked: false,
  createdBy: 'user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides
})

describe('LayerZoomService.calculateLayerBounds', () => {
  it('prefers metadata bounds when available', () => {
    const layer = createLayer({
      metadata: {
        tags: [],
        geometryType: 'Point',
        bounds: [1, 2, 1, 2]
      }
    })

    expect(LayerZoomService.calculateLayerBounds(layer)).toEqual({
      bounds: [1, 2, 1, 2],
      isPoint: true,
      isValid: true
    })
  })

  it('computes bounds from geojson source data', () => {
    const layer = createLayer({
      sourceConfig: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [0, 0] },
              properties: {}
            },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [5, 10] },
              properties: {}
            }
          ]
        }
      },
      metadata: {
        tags: []
      }
    })

    expect(LayerZoomService.calculateLayerBounds(layer)).toEqual({
      bounds: [0, 0, 5, 10],
      isPoint: true,
      isValid: true
    })
  })
})

describe('layer zoom actions', () => {
  it('uses fitBounds for animated zoom to one layer', async () => {
    const fitBounds = vi.fn()
    const jumpTo = vi.fn()
    const map = { fitBounds, jumpTo } as never

    const success = await LayerZoomService.zoomToLayer(map, createLayer(), { animate: true })

    expect(success).toBe(true)
    expect(fitBounds).toHaveBeenCalledTimes(1)
    expect(jumpTo).not.toHaveBeenCalled()
  })

  it('uses jumpTo for non-animated zoom', async () => {
    const fitBounds = vi.fn()
    const jumpTo = vi.fn()
    const map = { fitBounds, jumpTo } as never

    const success = await zoomToLayer(map, createLayer(), { animate: false, maxZoom: 12 })

    expect(success).toBe(true)
    expect(jumpTo).toHaveBeenCalledWith({
      center: [10, 20],
      zoom: 12
    })
  })

  it('combines bounds for multi-layer zoom', async () => {
    const fitBounds = vi.fn()
    const map = { fitBounds, jumpTo: vi.fn() } as never

    const layerA = createLayer({
      id: 'a',
      metadata: {
        tags: [],
        bounds: [0, 0, 5, 5]
      }
    })
    const layerB = createLayer({
      id: 'b',
      metadata: {
        tags: [],
        bounds: [10, -2, 20, 8]
      }
    })

    const success = await zoomToLayers(map, [layerA, layerB], { padding: 10 })

    expect(success).toBe(true)
    expect(fitBounds).toHaveBeenCalledWith([0, -2, 20, 8], {
      padding: 10,
      maxZoom: 18,
      duration: 1000
    })
  })

  it('returns false for invalid layers', async () => {
    const map = { fitBounds: vi.fn(), jumpTo: vi.fn() } as never
    const invalidLayer = createLayer({
      metadata: {
        tags: [],
        bounds: [1, 1, 1, 1],
        geometryType: 'LineString'
      }
    })

    await expect(zoomToLayer(map, invalidLayer)).resolves.toBe(false)
    expect(canZoomToLayer(invalidLayer)).toBe(false)
  })
})
