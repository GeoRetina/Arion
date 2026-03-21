import { describe, expect, it } from 'vitest'
import {
  areRasterRgbBandSelectionsEqual,
  buildRasterTileUrlWithRgbBandSelection,
  parseRasterRgbBandSelectionFromTileUrl,
  stripRasterRgbBandSelectionFromTileUrl
} from './raster-band-urls'

describe('raster-band-urls', () => {
  it('adds an rgb query parameter without encoding tile placeholders', () => {
    const url = buildRasterTileUrlWithRgbBandSelection(
      'arion-raster://tiles/asset/{z}/{x}/{y}.png',
      {
        red: 4,
        green: 3,
        blue: 2
      }
    )

    expect(url).toBe('arion-raster://tiles/asset/{z}/{x}/{y}.png?rgb=4%2C3%2C2')
  })

  it('parses an rgb selection from a raster tile url', () => {
    expect(
      parseRasterRgbBandSelectionFromTileUrl(
        'arion-raster://tiles/asset/{z}/{x}/{y}.png?foo=bar&rgb=5%2C2%2C1'
      )
    ).toEqual({
      red: 5,
      green: 2,
      blue: 1
    })
  })

  it('removes only the rgb query parameter when resetting to defaults', () => {
    expect(
      stripRasterRgbBandSelectionFromTileUrl(
        'arion-raster://tiles/asset/{z}/{x}/{y}.png?foo=bar&rgb=5%2C2%2C1'
      )
    ).toBe('arion-raster://tiles/asset/{z}/{x}/{y}.png?foo=bar')
  })

  it('compares rgb selections safely', () => {
    expect(
      areRasterRgbBandSelectionsEqual({ red: 1, green: 2, blue: 3 }, { red: 1, green: 2, blue: 3 })
    ).toBe(true)
    expect(
      areRasterRgbBandSelectionsEqual({ red: 1, green: 2, blue: 3 }, { red: 3, green: 2, blue: 1 })
    ).toBe(false)
  })
})
