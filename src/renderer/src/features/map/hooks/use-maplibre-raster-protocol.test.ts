import { describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl', () => ({
  addProtocol: () => {}
}))

import { __testing } from './use-maplibre-raster-protocol'

describe('use-maplibre-raster-protocol helpers', () => {
  it('parses raster tile urls including rgb band query parameters', () => {
    expect(
      __testing.parseRasterTileRequest(
        'arion-raster://tiles/123e4567-e89b-12d3-a456-426614174000/9/123/456.png?rgb=5%2C4%2C3'
      )
    ).toEqual({
      assetId: '123e4567-e89b-12d3-a456-426614174000',
      z: 9,
      x: 123,
      y: 456,
      rgbBands: {
        red: 5,
        green: 4,
        blue: 3
      }
    })
  })

  it('converts Uint8Array views into exact ArrayBuffers', () => {
    const bytes = new Uint8Array([9, 8, 7, 6]).subarray(1, 3)
    const arrayBuffer = __testing.toArrayBuffer(bytes)

    expect(Array.from(new Uint8Array(arrayBuffer))).toEqual([8, 7])
  })
})
