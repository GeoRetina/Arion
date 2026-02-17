import { describe, expect, it, vi } from 'vitest'
import { MapLayerTracker } from './map-layer-tracker'
import type { Feature, Point } from 'geojson'

const layerInfo = {
  sourceId: 'source-1',
  toolName: 'add_map_point',
  addedAt: new Date('2026-02-17T00:00:00.000Z').toISOString(),
  originalParams: {},
  geometryType: 'Point' as const
}

describe('MapLayerTracker', () => {
  it('tracks layer lifecycle operations', () => {
    const tracker = new MapLayerTracker()

    tracker.recordLayer(layerInfo)
    expect(tracker.hasLayer('source-1')).toBe(true)
    expect(tracker.getLayer('source-1')).toEqual(layerInfo)
    expect(tracker.listLayers()).toEqual([layerInfo])

    tracker.removeLayer('source-1')
    expect(tracker.hasLayer('source-1')).toBe(false)

    tracker.recordLayer(layerInfo)
    tracker.clear()
    expect(tracker.listLayers()).toEqual([])
  })

  it('sends map features only when a main window is configured', () => {
    const tracker = new MapLayerTracker()
    const send = vi.fn()

    const feature: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [10, 20] },
      properties: { name: 'A' }
    }

    tracker.sendFeatureToMap(feature)
    expect(send).not.toHaveBeenCalled()

    tracker.setMainWindow({
      webContents: {
        send
      }
    } as never)

    tracker.sendFeatureToMap(feature, {
      fitBounds: false,
      sourceId: 'custom-source'
    })

    expect(send).toHaveBeenCalledWith('ctg:map:addFeature', {
      feature,
      fitBounds: false,
      sourceId: 'custom-source'
    })
  })
})
