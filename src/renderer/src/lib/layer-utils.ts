/**
 * Layer Utilities
 *
 * Common utility functions for layer management, validation, and processing.
 * Provides helpers for layer operations, data transformation, and calculations.
 */

import type {
  LayerDefinition,
  LayerStyle,
  LayerSourceConfig,
  LayerMetadata,
  BoundingBox,
  GeometryType,
  LayerValidationResult,
  LayerError,
  LayerSearchCriteria,
  NumericStats,
  SpatialStats
} from '../../../shared/types/layer-types'

// Color utilities
export class ColorUtils {
  /**
   * Convert hex color to RGB array
   */
  static hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : null
  }

  /**
   * Convert RGB array to hex string
   */
  static rgbToHex(r: number, g: number, b: number): string {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }

  /**
   * Generate random color
   */
  static randomColor(): string {
    const colors = [
      '#3b82f6',
      '#ef4444',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#06b6d4',
      '#f97316',
      '#84cc16',
      '#ec4899',
      '#6366f1'
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  /**
   * Adjust color opacity
   */
  static withOpacity(color: string, opacity: number): string {
    const rgb = ColorUtils.hexToRgb(color)
    if (!rgb) return color

    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`
  }

  /**
   * Generate color palette
   */
  static generatePalette(count: number): string[] {
    const colors: string[] = []
    for (let i = 0; i < count; i++) {
      const hue = (i * 360) / count
      colors.push(`hsl(${hue}, 70%, 50%)`)
    }
    return colors
  }
}

// Geometry utilities
export class GeometryUtils {
  /**
   * Calculate bounding box from coordinates
   */
  static calculateBounds(coordinates: number[][]): BoundingBox {
    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity

    const processCoordinate = (coord: number[]) => {
      const [lng, lat] = coord
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }

    const processCoordinates = (coords: any) => {
      if (Array.isArray(coords[0])) {
        coords.forEach(processCoordinates)
      } else {
        processCoordinate(coords)
      }
    }

    coordinates.forEach(processCoordinates)

    return [minLng, minLat, maxLng, maxLat]
  }

  /**
   * Calculate center point from bounding box
   */
  static getBoundsCenter(bounds: BoundingBox): [number, number] {
    const [minLng, minLat, maxLng, maxLat] = bounds
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
  }

  /**
   * Check if two bounding boxes intersect
   */
  static boundsIntersect(bounds1: BoundingBox, bounds2: BoundingBox): boolean {
    const [minLng1, minLat1, maxLng1, maxLat1] = bounds1
    const [minLng2, minLat2, maxLng2, maxLat2] = bounds2

    return !(maxLng1 < minLng2 || minLng1 > maxLng2 || maxLat1 < minLat2 || minLat1 > maxLat2)
  }

  /**
   * Expand bounding box by percentage
   */
  static expandBounds(bounds: BoundingBox, factor: number): BoundingBox {
    const [minLng, minLat, maxLng, maxLat] = bounds
    const lngPadding = (maxLng - minLng) * factor
    const latPadding = (maxLat - minLat) * factor

    return [minLng - lngPadding, minLat - latPadding, maxLng + lngPadding, maxLat + latPadding]
  }

  /**
   * Calculate approximate area of bounding box in square kilometers
   */
  static calculateBoundsArea(bounds: BoundingBox): number {
    const [minLng, minLat, maxLng, maxLat] = bounds
    const degreeToKm = 111 // Approximate km per degree
    const width =
      (maxLng - minLng) * degreeToKm * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const height = (maxLat - minLat) * degreeToKm
    return width * height
  }
}

// Layer validation utilities
export class LayerValidationUtils {
  /**
   * Validate layer definition
   */
  static validateLayer(layer: Partial<LayerDefinition>): LayerValidationResult {
    const errors: LayerError[] = []
    const warnings: string[] = []

    // Required fields
    if (!layer.name?.trim()) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Layer name is required',
        timestamp: new Date()
      })
    }

    if (!layer.type) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Layer type is required',
        timestamp: new Date()
      })
    }

    if (!layer.sourceId?.trim()) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Source ID is required',
        timestamp: new Date()
      })
    }

    // Numeric validations
    if (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Opacity must be between 0 and 1',
        timestamp: new Date()
      })
    }

    if (layer.zIndex !== undefined && !Number.isInteger(layer.zIndex)) {
      warnings.push('Z-index should be an integer')
    }

    // Name validations
    if (layer.name && layer.name.length > 100) {
      warnings.push('Layer name is very long and may be truncated in UI')
    }

    if (layer.name && /[<>:"\/\\|?*]/.test(layer.name)) {
      warnings.push('Layer name contains special characters that may cause issues')
    }

    // Source config validation
    if (layer.sourceConfig) {
      const sourceValidation = this.validateSourceConfig(layer.sourceConfig)
      errors.push(...sourceValidation.errors)
      warnings.push(...sourceValidation.warnings)
    }

    // Style validation
    if (layer.style) {
      const styleValidation = this.validateStyle(layer.style)
      errors.push(...styleValidation.errors)
      warnings.push(...styleValidation.warnings)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate source configuration
   */
  static validateSourceConfig(config: LayerSourceConfig): LayerValidationResult {
    const errors: LayerError[] = []
    const warnings: string[] = []

    if (!config.type) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Source type is required',
        timestamp: new Date()
      })
    }

    if (!config.data) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Source data is required',
        timestamp: new Date()
      })
    }

    // URL validation for remote sources
    if (typeof config.data === 'string' && config.type !== 'geojson') {
      try {
        new URL(config.data)
      } catch {
        warnings.push('Source data appears to be an invalid URL')
      }
    }

    // Validate options
    if (config.options) {
      if (
        config.options.maxZoom !== undefined &&
        (config.options.maxZoom < 0 || config.options.maxZoom > 24)
      ) {
        warnings.push('Max zoom should be between 0 and 24')
      }

      if (
        config.options.minZoom !== undefined &&
        (config.options.minZoom < 0 || config.options.minZoom > 24)
      ) {
        warnings.push('Min zoom should be between 0 and 24')
      }

      if (
        config.options.maxZoom !== undefined &&
        config.options.minZoom !== undefined &&
        config.options.maxZoom < config.options.minZoom
      ) {
        errors.push({
          code: 'INVALID_LAYER_DATA',
          message: 'Max zoom must be greater than or equal to min zoom',
          timestamp: new Date()
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate layer style
   */
  static validateStyle(style: LayerStyle): LayerValidationResult {
    const errors: LayerError[] = []
    const warnings: string[] = []

    // Point style validations
    if (style.pointRadius !== undefined && (style.pointRadius < 0 || style.pointRadius > 100)) {
      warnings.push('Point radius should be between 0 and 100')
    }

    if (style.pointOpacity !== undefined && (style.pointOpacity < 0 || style.pointOpacity > 1)) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Point opacity must be between 0 and 1',
        timestamp: new Date()
      })
    }

    // Line style validations
    if (style.lineWidth !== undefined && (style.lineWidth < 0 || style.lineWidth > 50)) {
      warnings.push('Line width should be between 0 and 50')
    }

    if (style.lineOpacity !== undefined && (style.lineOpacity < 0 || style.lineOpacity > 1)) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Line opacity must be between 0 and 1',
        timestamp: new Date()
      })
    }

    // Fill style validations
    if (style.fillOpacity !== undefined && (style.fillOpacity < 0 || style.fillOpacity > 1)) {
      errors.push({
        code: 'INVALID_LAYER_DATA',
        message: 'Fill opacity must be between 0 and 1',
        timestamp: new Date()
      })
    }

    // Color validations
    const colorFields = [
      'pointColor',
      'pointStrokeColor',
      'lineColor',
      'fillColor',
      'fillOutlineColor',
      'textColor',
      'textHaloColor'
    ]
    for (const field of colorFields) {
      const color = style[field as keyof LayerStyle] as string
      if (color && !this.isValidColor(color)) {
        warnings.push(`${field} appears to be an invalid color format`)
      }
    }

    // Text size validation
    if (style.textSize !== undefined && (style.textSize < 1 || style.textSize > 72)) {
      warnings.push('Text size should be between 1 and 72')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate color format
   */
  static isValidColor(color: string): boolean {
    // Check hex format
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) return true

    // Check rgb/rgba format
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[0-1]?\.?\d+)?\s*\)$/.test(color)) return true

    // Check hsl/hsla format
    if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[0-1]?\.?\d+)?\s*\)$/.test(color)) return true

    // Check named colors (basic set)
    const namedColors = [
      'red',
      'blue',
      'green',
      'yellow',
      'orange',
      'purple',
      'pink',
      'brown',
      'black',
      'white',
      'gray',
      'grey',
      'cyan',
      'magenta',
      'lime',
      'navy'
    ]
    return namedColors.includes(color.toLowerCase())
  }
}

// Layer transformation utilities
export class LayerTransformUtils {
  /**
   * Create default layer from source config
   */
  static createDefaultLayer(
    name: string,
    sourceConfig: LayerSourceConfig,
    type: 'raster' | 'vector',
    options: {
      groupId?: string
      createdBy?: 'user' | 'tool' | 'mcp' | 'import'
      geometryType?: GeometryType
    } = {}
  ): Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'> {
    const now = new Date()

    return {
      name,
      type,
      sourceId: `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceConfig,
      style: this.getDefaultStyleForType(type, options.geometryType),
      visibility: true,
      opacity: 1.0,
      zIndex: 0,
      metadata: {
        description: `Auto-generated ${type} layer`,
        tags: [type, options.createdBy || 'user'],
        geometryType: options.geometryType,
        source: typeof sourceConfig.data === 'string' ? sourceConfig.data : 'inline-data'
      },
      groupId: options.groupId,
      isLocked: false,
      createdBy: options.createdBy || 'user'
    }
  }

  /**
   * Get default style for layer type
   */
  static getDefaultStyleForType(
    type: 'raster' | 'vector',
    geometryType?: GeometryType
  ): LayerStyle {
    if (type === 'raster') {
      return {
        rasterOpacity: 1,
        rasterBrightnessMin: 0,
        rasterBrightnessMax: 1,
        rasterSaturation: 0,
        rasterContrast: 0,
        rasterFadeDuration: 300
      }
    }

    // Vector layer defaults
    const baseStyle: LayerStyle = {
      pointRadius: 6,
      pointColor: ColorUtils.randomColor(),
      pointOpacity: 0.8,
      pointStrokeColor: '#ffffff',
      pointStrokeWidth: 2,
      pointStrokeOpacity: 1,

      lineColor: ColorUtils.randomColor(),
      lineWidth: 2,
      lineOpacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round',

      fillColor: ColorUtils.randomColor(),
      fillOpacity: 0.3,
      fillOutlineColor: '#000000',

      textSize: 12,
      textColor: '#000000',
      textHaloColor: '#ffffff',
      textHaloWidth: 1
    }

    // Customize based on geometry type
    if (geometryType) {
      const color = ColorUtils.randomColor()
      switch (geometryType) {
        case 'Point':
        case 'MultiPoint':
          baseStyle.pointColor = color
          break
        case 'LineString':
        case 'MultiLineString':
          baseStyle.lineColor = color
          break
        case 'Polygon':
        case 'MultiPolygon':
          baseStyle.fillColor = ColorUtils.withOpacity(color, 0.3)
          baseStyle.fillOutlineColor = color
          break
      }
    }

    return baseStyle
  }

  /**
   * Clone layer with modifications
   */
  static cloneLayer(
    layer: LayerDefinition,
    modifications: Partial<LayerDefinition> = {}
  ): Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'> {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...layerData } = layer

    return {
      ...layerData,
      name: modifications.name || `${layer.name} Copy`,
      sourceId: modifications.sourceId || `${layer.sourceId}-copy-${Date.now()}`,
      ...modifications
    }
  }

  /**
   * Convert layer to export format
   */
  static toExportFormat(layer: LayerDefinition): any {
    return {
      version: '1.0',
      layer: {
        ...layer,
        // Remove internal fields
        id: undefined,
        createdAt: layer.createdAt.toISOString(),
        updatedAt: layer.updatedAt.toISOString()
      }
    }
  }

  /**
   * Create layer from import data
   */
  static fromImportFormat(data: any): Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'> {
    if (!data.layer) {
      throw new Error('Invalid import format: missing layer data')
    }

    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...layerData } = data.layer

    // Convert date strings back to Date objects if they exist
    return layerData
  }
}

// Search and filtering utilities
export class LayerSearchUtils {
  /**
   * Build search criteria from query string
   */
  static parseSearchQuery(query: string): LayerSearchCriteria {
    const criteria: LayerSearchCriteria = {}

    // Extract type filter
    const typeMatch = query.match(/type:(\w+)/)
    if (typeMatch) {
      criteria.type = typeMatch[1] as 'raster' | 'vector'
      query = query.replace(typeMatch[0], '').trim()
    }

    // Extract tag filters
    const tagMatches = query.match(/tag:(\w+)/g)
    if (tagMatches) {
      criteria.tags = tagMatches.map((match) => match.replace('tag:', ''))
      query = query.replace(/tag:\w+/g, '').trim()
    }

    // Extract created by filter
    const createdByMatch = query.match(/createdBy:(\w+)/)
    if (createdByMatch) {
      criteria.createdBy = createdByMatch[1] as 'user' | 'tool' | 'mcp' | 'import'
      query = query.replace(createdByMatch[0], '').trim()
    }

    // Remaining text is the general search query
    if (query.trim()) {
      criteria.query = query.trim()
    }

    return criteria
  }

  /**
   * Filter layers by criteria
   */
  static filterLayers(layers: LayerDefinition[], criteria: LayerSearchCriteria): LayerDefinition[] {
    return layers.filter((layer) => {
      // Text search
      if (criteria.query) {
        const query = criteria.query.toLowerCase()
        const searchableText = [
          layer.name,
          layer.metadata.description || '',
          ...layer.metadata.tags
        ]
          .join(' ')
          .toLowerCase()

        if (!searchableText.includes(query)) return false
      }

      // Type filter
      if (criteria.type && layer.type !== criteria.type) return false

      // Tags filter
      if (criteria.tags?.length) {
        const hasAnyTag = criteria.tags.some((tag) => layer.metadata.tags.includes(tag))
        if (!hasAnyTag) return false
      }

      // Created by filter
      if (criteria.createdBy && layer.createdBy !== criteria.createdBy) return false

      // Date range filter
      if (criteria.dateRange) {
        const layerDate = layer.createdAt
        if (layerDate < criteria.dateRange.start || layerDate > criteria.dateRange.end) {
          return false
        }
      }

      // Bounds filter
      if (criteria.bounds && layer.metadata.bounds) {
        if (!GeometryUtils.boundsIntersect(criteria.bounds, layer.metadata.bounds)) {
          return false
        }
      }

      // Group filter
      if (criteria.groupId !== undefined && layer.groupId !== criteria.groupId) {
        return false
      }

      // Geometry filter
      if (criteria.hasGeometry !== undefined) {
        const hasGeometry = layer.metadata.geometryType !== undefined
        if (criteria.hasGeometry !== hasGeometry) return false
      }

      return true
    })
  }

  /**
   * Sort layers by relevance
   */
  static sortByRelevance(layers: LayerDefinition[], query?: string): LayerDefinition[] {
    if (!query) {
      return layers.sort((a, b) => {
        // Default sort: by z-index (desc) then by creation date (desc)
        if (a.zIndex !== b.zIndex) return b.zIndex - a.zIndex
        return b.createdAt.getTime() - a.createdAt.getTime()
      })
    }

    const queryLower = query.toLowerCase()

    return layers.sort((a, b) => {
      // Calculate relevance scores
      const scoreA = this.calculateRelevanceScore(a, queryLower)
      const scoreB = this.calculateRelevanceScore(b, queryLower)

      if (scoreA !== scoreB) return scoreB - scoreA

      // Tie-breaker: z-index then creation date
      if (a.zIndex !== b.zIndex) return b.zIndex - a.zIndex
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
  }

  /**
   * Calculate relevance score for search
   */
  private static calculateRelevanceScore(layer: LayerDefinition, query: string): number {
    let score = 0

    // Name matches (highest weight)
    if (layer.name.toLowerCase().includes(query)) {
      score += 10
      if (layer.name.toLowerCase().startsWith(query)) score += 5
    }

    // Description matches
    if (layer.metadata.description?.toLowerCase().includes(query)) {
      score += 3
    }

    // Tag matches
    for (const tag of layer.metadata.tags) {
      if (tag.toLowerCase().includes(query)) {
        score += 2
      }
    }

    // Type matches
    if (layer.type.toLowerCase().includes(query)) {
      score += 1
    }

    return score
  }
}

// Statistics utilities
export class LayerStatsUtils {
  /**
   * Calculate numeric statistics
   */
  static calculateNumericStats(values: number[]): NumericStats {
    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
        nullCount: 0
      }
    }

    const sortedValues = [...values].sort((a, b) => a - b)
    const sum = values.reduce((acc, val) => acc + val, 0)
    const mean = sum / values.length

    const median =
      values.length % 2 === 0
        ? (sortedValues[values.length / 2 - 1] + sortedValues[values.length / 2]) / 2
        : sortedValues[Math.floor(values.length / 2)]

    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    return {
      min: sortedValues[0],
      max: sortedValues[sortedValues.length - 1],
      mean,
      median,
      stdDev,
      nullCount: 0 // Would need to be calculated separately for real data
    }
  }

  /**
   * Calculate spatial statistics
   */
  static calculateSpatialStats(bounds: BoundingBox, coordinates?: number[][]): SpatialStats {
    const envelope = bounds
    let centroid: [number, number] = GeometryUtils.getBoundsCenter(bounds)

    // Calculate more accurate centroid if coordinates provided
    if (coordinates && coordinates.length > 0) {
      const flatCoords = coordinates.flat()
      let lngSum = 0
      let latSum = 0
      let count = 0

      for (let i = 0; i < flatCoords.length; i += 2) {
        lngSum += flatCoords[i]
        latSum += flatCoords[i + 1]
        count++
      }

      if (count > 0) {
        centroid = [lngSum / count, latSum / count]
      }
    }

    return {
      centroid,
      envelope,
      totalArea: GeometryUtils.calculateBoundsArea(bounds)
    }
  }

  /**
   * Generate layer summary statistics
   */
  static generateLayerSummary(layers: LayerDefinition[]): {
    total: number
    byType: Record<string, number>
    byOrigin: Record<string, number>
    byGroup: Record<string, number>
    visible: number
    withErrors: number
  } {
    const summary = {
      total: layers.length,
      byType: {} as Record<string, number>,
      byOrigin: {} as Record<string, number>,
      byGroup: {} as Record<string, number>,
      visible: 0,
      withErrors: 0
    }

    for (const layer of layers) {
      // Count by type
      summary.byType[layer.type] = (summary.byType[layer.type] || 0) + 1

      // Count by origin
      summary.byOrigin[layer.createdBy] = (summary.byOrigin[layer.createdBy] || 0) + 1

      // Count by group
      const groupKey = layer.groupId || 'ungrouped'
      summary.byGroup[groupKey] = (summary.byGroup[groupKey] || 0) + 1

      // Count visible layers
      if (layer.visibility) summary.visible++

      // Count layers with errors (would need error tracking)
      // summary.withErrors += hasErrors ? 1 : 0
    }

    return summary
  }
}

// Export all utilities
export const LayerUtils = {
  Color: ColorUtils,
  Geometry: GeometryUtils,
  Validation: LayerValidationUtils,
  Transform: LayerTransformUtils,
  Search: LayerSearchUtils,
  Stats: LayerStatsUtils
}
