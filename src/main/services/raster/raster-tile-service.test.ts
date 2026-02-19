import type { GeoTIFFImage } from 'geotiff'
import { describe, expect, it } from 'vitest'
import { __testing } from './raster-tile-service'

function createImageWithDirectory(fileDirectory: Record<string, unknown>): GeoTIFFImage {
  return { fileDirectory } as unknown as GeoTIFFImage
}

describe('raster-tile-service helpers', () => {
  it('detects palette-indexed imagery from photometric interpretation', () => {
    const image = createImageWithDirectory({ PhotometricInterpretation: 3 })
    expect(__testing.isPaletteIndexedImage(image)).toBe(true)
  })

  it('detects palette-indexed imagery from color map', () => {
    const image = createImageWithDirectory({ ColorMap: new Uint16Array([0, 1, 2]) })
    expect(__testing.isPaletteIndexedImage(image)).toBe(true)
  })

  it('detects byte-like imagery from 8-bit unsigned tags', () => {
    const image = createImageWithDirectory({ BitsPerSample: [8, 8, 8] })
    expect(__testing.isByteLikeImage(image)).toBe(true)
  })

  it('does not treat non-byte imagery as byte-like', () => {
    const sixteenBitImage = createImageWithDirectory({ BitsPerSample: [16] })
    expect(__testing.isByteLikeImage(sixteenBitImage)).toBe(false)

    const signedImage = createImageWithDirectory({ BitsPerSample: [8], SampleFormat: [2] })
    expect(__testing.isByteLikeImage(signedImage)).toBe(false)
  })

  it('reads numeric typed tag arrays', () => {
    const values = __testing.readNumericTagValues(
      { BitsPerSample: new Uint16Array([8, 8, 8]) },
      'BitsPerSample'
    )
    expect(values).toEqual([8, 8, 8])
  })

  it('computes robust percentile ranges that ignore sparse outliers', () => {
    const values = Array.from({ length: 2048 }, (_, index) => index % 101)
    values.push(50_000)
    const range = __testing.computeBandRange(values, null)

    expect(range).not.toBeNull()
    expect(range!.min).toBeGreaterThanOrEqual(0)
    expect(range!.max).toBeLessThan(500)
  })

  it('returns null when valid range cannot be derived', () => {
    expect(__testing.computeBandRange([0, 0, 0], 0)).toBeNull()
    expect(__testing.computeBandRange([], null)).toBeNull()
  })
})
