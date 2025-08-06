/**
 * Layer Style Factory
 * 
 * Creates default styles for different layer types and geometries.
 * Centralizes styling logic for consistency.
 */

import type { LayerStyle, GeometryType } from '../../../../../shared/types/layer-types'

export class LayerStyleFactory {
  /**
   * Create default style for vector layer based on geometry type
   */
  static createVectorStyle(geometryType?: GeometryType): LayerStyle {
    const baseStyle: LayerStyle = {}

    switch (geometryType) {
      case 'Point':
      case 'MultiPoint':
        return {
          ...baseStyle,
          pointRadius: 5,
          pointColor: '#3b82f6',
          pointOpacity: 0.8,
          pointStrokeColor: '#1d4ed8',
          pointStrokeWidth: 1
        }

      case 'LineString':
      case 'MultiLineString':
        return {
          ...baseStyle,
          lineColor: '#10b981',
          lineWidth: 2,
          lineOpacity: 0.8
        }

      case 'Polygon':
      case 'MultiPolygon':
        return {
          ...baseStyle,
          fillColor: '#8b5cf6',
          fillOpacity: 0.3,
          fillOutlineColor: '#7c3aed',
          lineWidth: 1
        }

      default:
        return {
          ...baseStyle,
          pointRadius: 5,
          pointColor: '#6b7280',
          pointOpacity: 0.8
        }
    }
  }

  /**
   * Create default style for raster layer
   */
  static createRasterStyle(): LayerStyle {
    return {
      rasterOpacity: 1.0,
      rasterBrightnessMin: 0,
      rasterBrightnessMax: 1,
      rasterSaturation: 0,
      rasterContrast: 0,
      rasterFadeDuration: 300
    }
  }

  /**
   * Create style with custom colors for vector layers
   */
  static createCustomVectorStyle(
    geometryType: GeometryType,
    primaryColor: string,
    secondaryColor?: string
  ): LayerStyle {
    const secondary = secondaryColor || this.darkenColor(primaryColor, 0.2)

    switch (geometryType) {
      case 'Point':
      case 'MultiPoint':
        return {
          pointRadius: 5,
          pointColor: primaryColor,
          pointOpacity: 0.8,
          pointStrokeColor: secondary,
          pointStrokeWidth: 1
        }

      case 'LineString':
      case 'MultiLineString':
        return {
          lineColor: primaryColor,
          lineWidth: 2,
          lineOpacity: 0.8
        }

      case 'Polygon':
      case 'MultiPolygon':
        return {
          fillColor: primaryColor,
          fillOpacity: 0.3,
          fillOutlineColor: secondary,
          lineWidth: 1
        }

      default:
        return this.createVectorStyle(geometryType)
    }
  }

  /**
   * Darken a hex color by a given factor
   */
  private static darkenColor(hex: string, factor: number): string {
    // Simple color darkening - remove # if present
    const color = hex.replace('#', '')
    const rgb = parseInt(color, 16)
    
    const r = (rgb >> 16) & 0xff
    const g = (rgb >> 8) & 0xff
    const b = rgb & 0xff
    
    const darkenedR = Math.max(0, Math.floor(r * (1 - factor)))
    const darkenedG = Math.max(0, Math.floor(g * (1 - factor)))
    const darkenedB = Math.max(0, Math.floor(b * (1 - factor)))
    
    return `#${((darkenedR << 16) | (darkenedG << 8) | darkenedB).toString(16).padStart(6, '0')}`
  }
}