import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerDefinition } from '../../../shared/types/layer-types'

vi.mock('@/utils/maplibre-integration', () => ({
  MapLibreIntegration: class {
    cleanup(): void {
      void 0
    }
  }
}))

import { useLayerStore } from './layer-store'
import { useMapStore } from './map-store'

const baseLayer: LayerDefinition = {
  id: 'layer-1',
  name: 'Imported polygon',
  type: 'vector',
  sourceId: 'source-1',
  sourceConfig: {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  },
  style: {
    fillColor: '#00ff00'
  },
  visibility: true,
  opacity: 1,
  zIndex: 0,
  metadata: {
    tags: ['imported'],
    geometryType: 'Polygon'
  },
  isLocked: false,
  createdBy: 'import',
  createdAt: new Date('2026-03-21T00:00:00.000Z'),
  updatedAt: new Date('2026-03-21T00:00:00.000Z')
}

describe('map-store', () => {
  beforeEach(() => {
    useLayerStore.getState().reset()
    useMapStore.setState({
      mapInstance: null,
      isMapReadyForOperations: false,
      pendingFeatures: [],
      pendingImageLayers: []
    })
  })

  it('routes sourceId paint updates through the layer store when a matching layer exists', () => {
    const updateLayerStyle = vi.fn().mockResolvedValue(undefined)

    useLayerStore.setState({
      layers: new Map([[baseLayer.id, baseLayer]]),
      updateLayerStyle: updateLayerStyle as never
    })

    useMapStore.getState().setLayerPaintProperties({
      sourceId: 'source-1',
      paintProperties: {
        'fill-color': '#ff0000',
        'fill-antialias': false
      }
    })

    expect(updateLayerStyle).toHaveBeenCalledWith('layer-1', {
      fillColor: '#ff0000',
      paint: {
        'fill-antialias': false
      }
    })
  })

  it('merges layout and filter updates through the layer store for matching layers', () => {
    const updateLayerStyle = vi.fn().mockResolvedValue(undefined)

    useLayerStore.setState({
      layers: new Map([[baseLayer.id, baseLayer]]),
      updateLayerStyle: updateLayerStyle as never
    })

    useMapStore.getState().updateLayerStyleProperties({
      sourceId: 'source-1',
      layoutProperties: {
        'line-cap': 'round'
      },
      filter: ['==', ['geometry-type'], 'Polygon']
    })

    expect(updateLayerStyle).toHaveBeenCalledWith('layer-1', {
      layout: {
        'line-cap': 'round'
      },
      filter: ['==', ['geometry-type'], 'Polygon']
    })
  })
})
