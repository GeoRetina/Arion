import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LayerStyle } from '../../../shared/types/layer-types'

export interface RawMapStyleUpdate {
  paintProperties?: Record<string, unknown>
  layoutProperties?: Record<string, unknown>
  filter?: unknown[]
}

export function applyLayerStyleToMap(
  map: MapLibreMap,
  mapLayerId: string,
  mapLayerType: string,
  style: LayerStyle,
  opacity: number
): void {
  applyFilter(map, mapLayerId, style.filter)

  switch (mapLayerType) {
    case 'circle':
      if (style.pointColor) {
        map.setPaintProperty(mapLayerId, 'circle-color', style.pointColor)
      }
      if (style.pointRadius !== undefined) {
        map.setPaintProperty(mapLayerId, 'circle-radius', style.pointRadius)
      }
      if (style.pointOpacity !== undefined) {
        map.setPaintProperty(mapLayerId, 'circle-opacity', style.pointOpacity * opacity)
      }
      if (style.pointStrokeColor) {
        map.setPaintProperty(mapLayerId, 'circle-stroke-color', style.pointStrokeColor)
      }
      if (style.pointStrokeWidth !== undefined) {
        map.setPaintProperty(mapLayerId, 'circle-stroke-width', style.pointStrokeWidth)
      }
      if (style.pointStrokeOpacity !== undefined) {
        map.setPaintProperty(
          mapLayerId,
          'circle-stroke-opacity',
          style.pointStrokeOpacity * opacity
        )
      }
      break

    case 'line':
      if (style.lineColor) {
        map.setPaintProperty(mapLayerId, 'line-color', style.lineColor)
      }
      if (style.lineWidth !== undefined) {
        map.setPaintProperty(mapLayerId, 'line-width', style.lineWidth)
      }
      if (style.lineOpacity !== undefined) {
        map.setPaintProperty(mapLayerId, 'line-opacity', style.lineOpacity * opacity)
      }
      if (style.lineDasharray) {
        map.setPaintProperty(mapLayerId, 'line-dasharray', style.lineDasharray)
      }
      if (style.lineOffset !== undefined) {
        map.setPaintProperty(mapLayerId, 'line-offset', style.lineOffset)
      }
      if (style.lineCap) {
        map.setLayoutProperty(mapLayerId, 'line-cap', style.lineCap)
      }
      if (style.lineJoin) {
        map.setLayoutProperty(mapLayerId, 'line-join', style.lineJoin)
      }
      break

    case 'fill':
      if (style.fillColor) {
        map.setPaintProperty(mapLayerId, 'fill-color', style.fillColor)
      }
      if (style.fillOpacity !== undefined) {
        map.setPaintProperty(mapLayerId, 'fill-opacity', style.fillOpacity * opacity)
      }
      if (style.fillOutlineColor) {
        map.setPaintProperty(mapLayerId, 'fill-outline-color', style.fillOutlineColor)
      }
      if (style.fillPattern) {
        map.setPaintProperty(mapLayerId, 'fill-pattern', style.fillPattern)
      }
      break

    case 'raster':
      if (style.rasterOpacity !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-opacity', style.rasterOpacity * opacity)
      }
      if (style.rasterHueRotate !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-hue-rotate', style.rasterHueRotate)
      }
      if (style.rasterBrightnessMin !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-brightness-min', style.rasterBrightnessMin)
      }
      if (style.rasterBrightnessMax !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-brightness-max', style.rasterBrightnessMax)
      }
      if (style.rasterSaturation !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-saturation', style.rasterSaturation)
      }
      if (style.rasterContrast !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-contrast', style.rasterContrast)
      }
      if (style.rasterFadeDuration !== undefined) {
        map.setPaintProperty(mapLayerId, 'raster-fade-duration', style.rasterFadeDuration)
      }
      break

    case 'symbol':
      if (style.textField) {
        map.setLayoutProperty(mapLayerId, 'text-field', style.textField)
      }
      if (style.textFont) {
        map.setLayoutProperty(mapLayerId, 'text-font', style.textFont)
      }
      if (style.textSize !== undefined) {
        map.setLayoutProperty(mapLayerId, 'text-size', style.textSize)
      }
      if (style.textOffset) {
        map.setLayoutProperty(mapLayerId, 'text-offset', style.textOffset)
      }
      if (style.textAnchor) {
        map.setLayoutProperty(mapLayerId, 'text-anchor', style.textAnchor)
      }
      if (style.textColor) {
        map.setPaintProperty(mapLayerId, 'text-color', style.textColor)
      }
      if (style.textHaloColor) {
        map.setPaintProperty(mapLayerId, 'text-halo-color', style.textHaloColor)
      }
      if (style.textHaloWidth !== undefined) {
        map.setPaintProperty(mapLayerId, 'text-halo-width', style.textHaloWidth)
      }
      if (style.iconImage) {
        map.setLayoutProperty(mapLayerId, 'icon-image', style.iconImage)
      }
      if (style.iconSize !== undefined) {
        map.setLayoutProperty(mapLayerId, 'icon-size', style.iconSize)
      }
      if (style.iconRotate !== undefined) {
        map.setLayoutProperty(mapLayerId, 'icon-rotate', style.iconRotate)
      }
      if (style.iconOffset) {
        map.setLayoutProperty(mapLayerId, 'icon-offset', style.iconOffset)
      }
      if (style.iconOpacity !== undefined) {
        map.setPaintProperty(mapLayerId, 'icon-opacity', style.iconOpacity * opacity)
      }
      break
  }

  if (style.layout) {
    for (const [propertyName, propertyValue] of Object.entries(style.layout)) {
      map.setLayoutProperty(mapLayerId, propertyName, propertyValue)
    }
  }

  if (style.paint) {
    for (const [propertyName, propertyValue] of Object.entries(style.paint)) {
      map.setPaintProperty(mapLayerId, propertyName, propertyValue)
    }
  }
}

export function applyRawMapStyleUpdate(
  map: MapLibreMap,
  mapLayerId: string,
  update: RawMapStyleUpdate
): void {
  applyFilter(map, mapLayerId, update.filter)

  if (update.layoutProperties) {
    for (const [propertyName, propertyValue] of Object.entries(update.layoutProperties)) {
      map.setLayoutProperty(mapLayerId, propertyName, propertyValue)
    }
  }

  if (update.paintProperties) {
    for (const [propertyName, propertyValue] of Object.entries(update.paintProperties)) {
      map.setPaintProperty(mapLayerId, propertyName, propertyValue)
    }
  }
}

function applyFilter(map: MapLibreMap, mapLayerId: string, filter?: unknown[]): void {
  if (!Array.isArray(filter)) {
    return
  }

  map.setFilter(mapLayerId, filter as never)
}
