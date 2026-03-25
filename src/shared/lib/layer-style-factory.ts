import type { GeometryType, LayerStyle, LayerType } from '../types/layer-types'

const VECTOR_TEXT_STYLE: LayerStyle = {
  textSize: 12,
  textColor: '#000000',
  textHaloColor: '#ffffff',
  textHaloWidth: 1
}

function pickRandomVectorColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const saturation = 62 + Math.floor(Math.random() * 19)
  const lightness = 42 + Math.floor(Math.random() * 15)
  return hslToHex(hue, saturation, lightness)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = (((hue % 360) + 360) % 360) / 360
  const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100
  const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100

  if (normalizedSaturation === 0) {
    const channel = Math.round(normalizedLightness * 255)
    return rgbToHex(channel, channel, channel)
  }

  const q =
    normalizedLightness < 0.5
      ? normalizedLightness * (1 + normalizedSaturation)
      : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation
  const p = 2 * normalizedLightness - q

  const convert = (t: number): number => {
    let channel = t

    if (channel < 0) channel += 1
    if (channel > 1) channel -= 1
    if (channel < 1 / 6) return p + (q - p) * 6 * channel
    if (channel < 1 / 2) return q
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6
    return p
  }

  return rgbToHex(
    Math.round(convert(normalizedHue + 1 / 3) * 255),
    Math.round(convert(normalizedHue) * 255),
    Math.round(convert(normalizedHue - 1 / 3) * 255)
  )
}

function rgbToHex(red: number, green: number, blue: number): string {
  return (
    '#' +
    [red, green, blue]
      .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
      .join('')
  )
}

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null
}

function withOpacity(color: string, opacity: number): string {
  const rgb = hexToRgb(color)
  if (!rgb) {
    return color
  }

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`
}

export class LayerStyleFactory {
  static createLayerStyle(
    type: LayerType,
    geometryType?: GeometryType,
    baseColor?: string
  ): LayerStyle {
    return type === 'raster'
      ? this.createRasterStyle()
      : this.createVectorStyle(geometryType, baseColor)
  }

  static createVectorStyle(
    geometryType?: GeometryType,
    baseColor = pickRandomVectorColor()
  ): LayerStyle {
    switch (geometryType) {
      case 'Point':
      case 'MultiPoint':
        return {
          ...VECTOR_TEXT_STYLE,
          pointRadius: 5,
          pointColor: baseColor,
          pointOpacity: 0.8,
          pointStrokeColor: '#ffffff',
          pointStrokeWidth: 1,
          pointStrokeOpacity: 1
        }

      case 'LineString':
      case 'MultiLineString':
        return {
          ...VECTOR_TEXT_STYLE,
          lineColor: baseColor,
          lineWidth: 2,
          lineOpacity: 0.8,
          lineCap: 'round',
          lineJoin: 'round'
        }

      case 'Polygon':
      case 'MultiPolygon':
        return {
          ...VECTOR_TEXT_STYLE,
          fillColor: withOpacity(baseColor, 0.3),
          fillOpacity: 0.3,
          fillOutlineColor: baseColor,
          lineWidth: 1
        }

      default:
        return {
          ...VECTOR_TEXT_STYLE,
          pointRadius: 5,
          pointColor: baseColor,
          pointOpacity: 0.8,
          pointStrokeColor: '#ffffff',
          pointStrokeWidth: 1,
          pointStrokeOpacity: 1,
          lineColor: baseColor,
          lineWidth: 2,
          lineOpacity: 0.8,
          lineCap: 'round',
          lineJoin: 'round',
          fillColor: withOpacity(baseColor, 0.3),
          fillOpacity: 0.3,
          fillOutlineColor: baseColor
        }
    }
  }

  static createRasterStyle(): LayerStyle {
    return {
      rasterOpacity: 1,
      rasterBrightnessMin: 0,
      rasterBrightnessMax: 1,
      rasterSaturation: 0,
      rasterContrast: 0,
      rasterFadeDuration: 300
    }
  }
}
