import { describe, expect, it } from 'vitest'
import {
  inferNativeMaxZoom,
  intersection,
  lonLatToWebMercator,
  mapBoundsToSourceBounds,
  sourceBoundsToMapBounds,
  tileToLonLatBounds
} from './raster-coordinate-utils'

describe('raster-coordinate-utils', () => {
  it('round-trips map bounds for EPSG:3857', () => {
    const sourceBounds: [number, number, number, number] = [
      -20037508, -20037508, 20037508, 20037508
    ]
    const mapBounds = sourceBoundsToMapBounds(sourceBounds, 'EPSG:3857')
    const roundTripped = mapBoundsToSourceBounds(mapBounds, 'EPSG:3857')

    expect(roundTripped[0]).toBeCloseTo(sourceBounds[0], 0)
    expect(roundTripped[1]).toBeCloseTo(sourceBounds[1], 0)
    expect(roundTripped[2]).toBeCloseTo(sourceBounds[2], 0)
    expect(roundTripped[3]).toBeCloseTo(sourceBounds[3], 0)
  })

  it('computes valid lon/lat tile bounds', () => {
    const bounds = tileToLonLatBounds(1, 1, 1)
    expect(bounds[0]).toBeCloseTo(0, 6)
    expect(bounds[2]).toBeCloseTo(180, 6)
    expect(bounds[1]).toBeLessThan(bounds[3])
  })

  it('returns null for non-intersecting extents', () => {
    const overlap = intersection([0, 0, 1, 1], [2, 2, 3, 3])
    expect(overlap).toBeNull()
  })

  it('infers native zoom from resolution', () => {
    const zoom = inferNativeMaxZoom([-180, -90, 180, 90], 1024, 'EPSG:4326')
    expect(zoom).toBeGreaterThan(0)
  })

  it('projects lon/lat to WebMercator meters', () => {
    const [x, y] = lonLatToWebMercator(0, 0)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
  })
})
