import type { LayerStyle } from '../../../shared/types/layer-types'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isFiniteNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) => isFiniteNumber(entry))

const isStringValue = (value: unknown): value is string => typeof value === 'string'

function applyTypedPaintProperty(
  styleUpdate: Partial<LayerStyle>,
  propertyName: string,
  value: unknown
): boolean {
  switch (propertyName) {
    case 'circle-color':
      if (isStringValue(value)) {
        styleUpdate.pointColor = value
        return true
      }
      return false

    case 'circle-radius':
      if (isFiniteNumber(value)) {
        styleUpdate.pointRadius = value
        return true
      }
      return false

    case 'circle-opacity':
      if (isFiniteNumber(value)) {
        styleUpdate.pointOpacity = value
        return true
      }
      return false

    case 'circle-stroke-color':
      if (isStringValue(value)) {
        styleUpdate.pointStrokeColor = value
        return true
      }
      return false

    case 'circle-stroke-width':
      if (isFiniteNumber(value)) {
        styleUpdate.pointStrokeWidth = value
        return true
      }
      return false

    case 'circle-stroke-opacity':
      if (isFiniteNumber(value)) {
        styleUpdate.pointStrokeOpacity = value
        return true
      }
      return false

    case 'line-color':
      if (isStringValue(value)) {
        styleUpdate.lineColor = value
        return true
      }
      return false

    case 'line-width':
      if (isFiniteNumber(value)) {
        styleUpdate.lineWidth = value
        return true
      }
      return false

    case 'line-opacity':
      if (isFiniteNumber(value)) {
        styleUpdate.lineOpacity = value
        return true
      }
      return false

    case 'line-dasharray':
      if (isFiniteNumberArray(value)) {
        styleUpdate.lineDasharray = value
        return true
      }
      return false

    case 'line-offset':
      if (isFiniteNumber(value)) {
        styleUpdate.lineOffset = value
        return true
      }
      return false

    case 'fill-color':
      if (isStringValue(value)) {
        styleUpdate.fillColor = value
        return true
      }
      return false

    case 'fill-opacity':
      if (isFiniteNumber(value)) {
        styleUpdate.fillOpacity = value
        return true
      }
      return false

    case 'fill-outline-color':
      if (isStringValue(value)) {
        styleUpdate.fillOutlineColor = value
        return true
      }
      return false

    case 'fill-pattern':
      if (isStringValue(value)) {
        styleUpdate.fillPattern = value
        return true
      }
      return false

    case 'raster-opacity':
      if (isFiniteNumber(value)) {
        styleUpdate.rasterOpacity = value
        return true
      }
      return false

    case 'raster-hue-rotate':
      if (isFiniteNumber(value)) {
        styleUpdate.rasterHueRotate = value
        return true
      }
      return false

    case 'raster-brightness-min':
      if (isFiniteNumber(value)) {
        styleUpdate.rasterBrightnessMin = value
        return true
      }
      return false

    case 'raster-brightness-max':
      if (isFiniteNumber(value)) {
        styleUpdate.rasterBrightnessMax = value
        return true
      }
      return false

    case 'raster-saturation':
      if (isFiniteNumber(value)) {
        styleUpdate.rasterSaturation = value
        return true
      }
      return false

    case 'raster-contrast':
      if (isFiniteNumber(value)) {
        styleUpdate.rasterContrast = value
        return true
      }
      return false

    case 'text-color':
      if (isStringValue(value)) {
        styleUpdate.textColor = value
        return true
      }
      return false

    case 'text-halo-color':
      if (isStringValue(value)) {
        styleUpdate.textHaloColor = value
        return true
      }
      return false

    case 'text-halo-width':
      if (isFiniteNumber(value)) {
        styleUpdate.textHaloWidth = value
        return true
      }
      return false

    case 'icon-opacity':
      if (isFiniteNumber(value)) {
        styleUpdate.iconOpacity = value
        return true
      }
      return false

    default:
      return false
  }
}

export function createStyleUpdateFromPaintProperties(
  paintProperties: Record<string, unknown>,
  existingStyle: LayerStyle = {}
): Partial<LayerStyle> {
  const styleUpdate: Partial<LayerStyle> = {}
  const customPaint = { ...(existingStyle.paint || {}) }

  for (const [propertyName, value] of Object.entries(paintProperties)) {
    const consumedByTypedStyle = applyTypedPaintProperty(styleUpdate, propertyName, value)

    if (consumedByTypedStyle) {
      delete customPaint[propertyName]
      continue
    }

    customPaint[propertyName] = value
  }

  if (existingStyle.paint || Object.keys(customPaint).length > 0) {
    styleUpdate.paint = customPaint
  }

  return styleUpdate
}

export function createStyleUpdateFromMapStyleProperties(
  input: {
    paintProperties?: Record<string, unknown>
    layoutProperties?: Record<string, unknown>
    filter?: unknown[]
  },
  existingStyle: LayerStyle = {}
): Partial<LayerStyle> {
  const styleUpdate: Partial<LayerStyle> = {}

  if (input.paintProperties && Object.keys(input.paintProperties).length > 0) {
    Object.assign(
      styleUpdate,
      createStyleUpdateFromPaintProperties(input.paintProperties, existingStyle)
    )
  }

  if (input.layoutProperties && Object.keys(input.layoutProperties).length > 0) {
    styleUpdate.layout = {
      ...(existingStyle.layout || {}),
      ...input.layoutProperties
    }
  }

  if (Array.isArray(input.filter)) {
    styleUpdate.filter = [...input.filter]
  }

  return styleUpdate
}
