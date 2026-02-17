import { describe, expect, it } from 'vitest'
import { ColorUtils, GeometryUtils, LayerValidationUtils } from './layer-utils'

describe('ColorUtils', () => {
  it('converts between hex and rgb', () => {
    expect(ColorUtils.hexToRgb('#0a1b2c')).toEqual([10, 27, 44])
    expect(ColorUtils.hexToRgb('invalid')).toBeNull()
    expect(ColorUtils.rgbToHex(10, 27, 44)).toBe('#0a1b2c')
  })

  it('builds rgba colors with opacity', () => {
    expect(ColorUtils.withOpacity('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(ColorUtils.withOpacity('invalid', 0.5)).toBe('invalid')
  })
})

describe('GeometryUtils', () => {
  it('calculates bounds and center for nested coordinates', () => {
    const bounds = GeometryUtils.calculateBounds([
      [
        [-74, 40],
        [-73.5, 40.5]
      ],
      [
        [-75, 39.5],
        [-73, 41]
      ]
    ] as never)

    expect(bounds).toEqual([-75, 39.5, -73, 41])
    expect(GeometryUtils.getBoundsCenter(bounds)).toEqual([-74, 40.25])
  })

  it('detects intersections correctly', () => {
    expect(GeometryUtils.boundsIntersect([0, 0, 5, 5], [4, 4, 8, 8])).toBe(true)
    expect(GeometryUtils.boundsIntersect([0, 0, 2, 2], [3, 3, 5, 5])).toBe(false)
  })
})

describe('LayerValidationUtils', () => {
  it('validates style ranges and color formats', () => {
    const validation = LayerValidationUtils.validateStyle({
      pointOpacity: 1.2,
      lineOpacity: -0.1,
      fillOpacity: 2,
      pointColor: '#ff0000',
      lineColor: 'not-a-color',
      textSize: 100
    })

    expect(validation.valid).toBe(false)
    expect(validation.errors).toHaveLength(3)
    expect(validation.warnings).toContain('lineColor appears to be an invalid color format')
    expect(validation.warnings).toContain('Text size should be between 1 and 72')
  })

  it('validates known color formats', () => {
    expect(LayerValidationUtils.isValidColor('#fff')).toBe(true)
    expect(LayerValidationUtils.isValidColor('rgba(255, 0, 0, 0.5)')).toBe(true)
    expect(LayerValidationUtils.isValidColor('hsl(10, 20%, 30%)')).toBe(true)
    expect(LayerValidationUtils.isValidColor('blue')).toBe(true)
    expect(LayerValidationUtils.isValidColor('color(1 2 3)')).toBe(false)
  })
})
