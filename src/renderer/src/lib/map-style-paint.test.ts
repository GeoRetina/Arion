import { describe, expect, it } from 'vitest'
import type { LayerStyle } from '../../../shared/types/layer-types'
import { createStyleUpdateFromPaintProperties } from './map-style-paint'

describe('createStyleUpdateFromPaintProperties', () => {
  it('maps known paint properties to typed layer style fields', () => {
    const result = createStyleUpdateFromPaintProperties({
      'fill-color': '#ff0000',
      'fill-opacity': 0.45,
      'line-dasharray': [2, 4]
    })

    expect(result).toEqual({
      fillColor: '#ff0000',
      fillOpacity: 0.45,
      lineDasharray: [2, 4]
    })
  })

  it('preserves unknown or expression-based paint properties in style.paint', () => {
    const existingStyle: LayerStyle = {
      paint: {
        'fill-color': '#00ff00',
        'legacy-prop': true
      }
    }

    const expressionValue = ['interpolate', ['linear'], ['zoom'], 1, 2, 10, 6]
    const result = createStyleUpdateFromPaintProperties(
      {
        'fill-color': '#ff0000',
        'fill-antialias': false,
        'circle-radius': expressionValue
      },
      existingStyle
    )

    expect(result.fillColor).toBe('#ff0000')
    expect(result.paint).toEqual({
      'legacy-prop': true,
      'fill-antialias': false,
      'circle-radius': expressionValue
    })
  })
})
