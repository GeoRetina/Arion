import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayerStyleFactory } from './layer-style-factory'

function withOpacity(hexColor: string, opacity: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor)
  if (!match) {
    throw new Error(`Invalid hex color in test: ${hexColor}`)
  }

  return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${opacity})`
}

describe('LayerStyleFactory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses one generated base color for line imports', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.21)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.6)

    const style = LayerStyleFactory.createVectorStyle('LineString')

    expect(style.lineColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(style.lineWidth).toBe(2)
    expect(style.lineOpacity).toBe(0.8)
  })

  it('derives polygon fill and outline from the same random base color', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.41)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.5)

    const style = LayerStyleFactory.createVectorStyle('Polygon')

    expect(style.fillOutlineColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(style.fillColor).toBe(withOpacity(style.fillOutlineColor!, 0.3))
    expect(style.fillOpacity).toBe(0.3)
  })

  it('applies the same random base color across mixed-geometry fallback styles', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.81)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.7)

    const style = LayerStyleFactory.createVectorStyle()

    expect(style.pointColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(style.lineColor).toBe(style.pointColor)
    expect(style.fillOutlineColor).toBe(style.pointColor)
    expect(style.fillColor).toBe(withOpacity(style.pointColor!, 0.3))
  })
})
