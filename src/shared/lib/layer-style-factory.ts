import type { GeometryType, LayerStyle } from '../types/layer-types'

export class LayerStyleFactory {
  static createVectorStyle(geometryType?: GeometryType): LayerStyle {
    switch (geometryType) {
      case 'Point':
      case 'MultiPoint':
        return {
          pointRadius: 5,
          pointColor: '#3b82f6',
          pointOpacity: 0.8,
          pointStrokeColor: '#1d4ed8',
          pointStrokeWidth: 1
        }

      case 'LineString':
      case 'MultiLineString':
        return {
          lineColor: '#10b981',
          lineWidth: 2,
          lineOpacity: 0.8
        }

      case 'Polygon':
      case 'MultiPolygon':
        return {
          fillColor: '#8b5cf6',
          fillOpacity: 0.3,
          fillOutlineColor: '#7c3aed',
          lineWidth: 1
        }

      default:
        return {
          pointRadius: 5,
          pointColor: '#6b7280',
          pointOpacity: 0.8
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
