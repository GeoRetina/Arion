/**
 * Layer Management Type Definitions
 *
 * Core types for the centralized layer management system.
 * These types are shared between main and renderer processes.
 */

// Core layer definition interface
export interface LayerDefinition {
  id: string // Unique identifier (UUID)
  name: string // User-friendly display name
  type: LayerType // Layer type classification
  sourceId: string // MapLibre GL source identifier
  sourceConfig: LayerSourceConfig // Source configuration data
  style: LayerStyle // Complete styling configuration
  visibility: boolean // Current visibility state
  opacity: number // Layer opacity (0.0 - 1.0)
  zIndex: number // Display order (higher = on top)
  metadata: LayerMetadata // Extended layer information
  groupId?: string // Optional layer group assignment
  isLocked: boolean // Prevents accidental modifications
  createdBy: LayerOrigin // Creation source tracking
  createdAt: Date // Creation timestamp
  updatedAt: Date // Last modification timestamp
}

// Layer type enumeration
export type LayerType = 'raster' | 'vector'

// Layer creation origins
export type LayerOrigin = 'user' | 'tool' | 'mcp' | 'import'

// Context information for layer creation
export interface LayerContext {
  chatId?: string | null // Associated chat session ID
  userId?: string // User who initiated the action
  source?: string // Source component/service name
  metadata?: Record<string, UnsafeAny> // Additional context metadata
}

// Source configuration for different layer types
export interface LayerSourceConfig {
  type: LayerSourceType
  data: string | object // URL, file path, or inline data
  mcpServerId?: string // MCP server identifier (if applicable)
  credentials?: LayerCredentials // Authentication information
  options?: LayerSourceOptions // Additional source options
}

export type LayerSourceType =
  | 'geojson'
  | 'raster'
  | 'vector-tiles'
  | 'image'
  | 'wms'
  | 'wmts'
  | 'xyz'

export interface LayerCredentials {
  type: 'basic' | 'bearer' | 'api-key'
  username?: string
  password?: string
  token?: string
  apiKey?: string
  headers?: Record<string, string>
}

export interface LayerSourceOptions {
  tileSize?: number
  maxZoom?: number
  minZoom?: number
  attribution?: string
  scheme?: 'xyz' | 'tms'
  bounds?: [number, number, number, number]
  buffer?: number
  tolerance?: number
  cluster?: boolean
  clusterMaxZoom?: number
  clusterRadius?: number
}

// Comprehensive styling configuration
export interface LayerStyle {
  // Vector layer styles - Points
  pointRadius?: number
  pointColor?: string
  pointOpacity?: number
  pointStrokeColor?: string
  pointStrokeWidth?: number
  pointStrokeOpacity?: number

  // Vector layer styles - Lines
  lineColor?: string
  lineWidth?: number
  lineOpacity?: number
  lineDasharray?: number[]
  lineOffset?: number
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'bevel' | 'round' | 'miter'

  // Vector layer styles - Polygons
  fillColor?: string
  fillOpacity?: number
  fillOutlineColor?: string
  fillPattern?: string

  // Raster layer styles
  rasterOpacity?: number
  rasterHueRotate?: number
  rasterBrightnessMin?: number
  rasterBrightnessMax?: number
  rasterSaturation?: number
  rasterContrast?: number
  rasterFadeDuration?: number

  // Text/Symbol styles
  textField?: string
  textFont?: string[]
  textSize?: number
  textColor?: string
  textHaloColor?: string
  textHaloWidth?: number
  textOffset?: [number, number]
  textAnchor?:
    | 'center'
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'

  // Icon styles
  iconImage?: string
  iconSize?: number
  iconRotate?: number
  iconOpacity?: number
  iconOffset?: [number, number]

  // Advanced styling
  filter?: UnsafeAny[] // MapLibre GL filter expression
  layout?: Record<string, UnsafeAny> // Custom layout properties
  paint?: Record<string, UnsafeAny> // Custom paint properties
}

// Extended layer metadata
export interface LayerMetadata {
  description?: string // Layer description
  tags: string[] // Searchable tags
  source?: string // Original data source
  license?: string // Data license information
  geometryType?: GeometryType // Geometry type for vector layers
  featureCount?: number // Number of features (estimated)
  bounds?: BoundingBox // Spatial extent
  crs?: string // Coordinate reference system
  attributes?: Record<string, AttributeInfo> // Feature attributes schema
  statistics?: LayerStatistics // Data statistics
  temporalExtent?: TemporalExtent // Time range (if applicable)
  quality?: DataQuality // Data quality metrics
}

export type GeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon'
  | 'GeometryCollection'

export type BoundingBox = [number, number, number, number] // [minLng, minLat, maxLng, maxLat]

export interface AttributeInfo {
  type: 'string' | 'number' | 'boolean' | 'date'
  nullable: boolean
  unique?: boolean
  values?: (string | number)[] // Enum values (if applicable)
  min?: number // Min value for numbers
  max?: number // Max value for numbers
  description?: string
}

export interface LayerStatistics {
  totalFeatures: number
  uniqueValues?: Record<string, number>
  numericStats?: Record<string, NumericStats>
  spatialStats?: SpatialStats
}

export interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  stdDev: number
  nullCount: number
}

export interface SpatialStats {
  totalArea?: number
  totalLength?: number
  centroid?: [number, number]
  envelope: BoundingBox
}

export interface TemporalExtent {
  startDate: Date
  endDate: Date
  resolution?: 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year'
}

export interface DataQuality {
  completeness: number // 0-1 (percentage of non-null values)
  accuracy?: number // 0-1 (if measurable)
  consistency?: number // 0-1 (internal consistency)
  timeliness?: number // 0-1 (how recent is the data)
  lastValidated?: Date
  validationNotes?: string[]
}

// Layer grouping system
export interface LayerGroup {
  id: string // Unique group identifier
  name: string // Display name
  parentId?: string // Parent group (for nesting)
  displayOrder: number // Order within parent
  expanded: boolean // UI expansion state
  layerIds: string[] // Ordered layer IDs in this group
  color?: string // Group color coding
  description?: string // Group description
  createdAt: Date
  updatedAt: Date
}

// Layer operations and events
export interface LayerOperation {
  type: LayerOperationType
  layerId: string
  changes?: Partial<LayerDefinition>
  timestamp: Date
  userId?: string
}

export type LayerOperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'reorder'
  | 'group'
  | 'ungroup'
  | 'style-change'
  | 'visibility-toggle'

// Import/Export types
export interface LayerImportConfig {
  file: File | string // File object or path
  format: ImportFormat // File format
  options?: ImportOptions // Format-specific options
  targetGroupId?: string // Target group for imported layers
  stylePreset?: string // Default styling preset
}

export type ImportFormat = 'geojson' | 'shapefile' | 'geotiff'

export interface ImportOptions {
  encoding?: string // Text encoding for files
  crs?: string // Source coordinate system
  geometryColumn?: string // Geometry column name
}

export interface LayerExportConfig {
  layerIds: string[] // Layers to export
  format: ExportFormat // Output format
  options?: ExportOptions // Format-specific options
  includeStyle?: boolean // Include styling information
  clipToBounds?: BoundingBox // Optional spatial clipping
}

export type ExportFormat = 'geojson' | 'shapefile' | 'geotiff'

export interface ExportOptions {
  precision?: number // Coordinate precision
  includeMetadata?: boolean // Include layer metadata
  flattenAttributes?: boolean // Flatten nested attributes
  coordinateSystem?: string // Target CRS
}

// Style presets and templates
export interface StylePreset {
  id: string
  name: string
  description?: string
  layerType: LayerType
  geometryType?: GeometryType
  style: LayerStyle
  preview?: string // Base64 encoded preview image
  isBuiltIn: boolean // System vs user preset
  tags: string[]
  createdAt: Date
}

// Error handling types
export interface LayerError {
  code: LayerErrorCode
  message: string
  details?: UnsafeAny
  layerId?: string
  timestamp: Date
}

export type LayerErrorCode =
  | 'LAYER_NOT_FOUND'
  | 'INVALID_LAYER_DATA'
  | 'SOURCE_LOAD_FAILED'
  | 'STYLE_APPLY_FAILED'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_CREDENTIALS'

// Validation schemas (for runtime validation)
export interface LayerValidationResult {
  valid: boolean
  errors: LayerError[]
  warnings: string[]
}

// Performance monitoring
export interface LayerPerformanceMetrics {
  layerId: string
  loadTime: number // Milliseconds to load
  renderTime: number // Milliseconds to first render
  memoryUsage: number // Bytes
  featureCount: number
  timestamp: Date
}

// Search and filtering
export interface LayerSearchCriteria {
  query?: string // Text search
  type?: LayerType // Filter by type
  tags?: string[] // Filter by tags
  createdBy?: LayerOrigin // Filter by origin
  dateRange?: {
    start: Date
    end: Date
  }
  bounds?: BoundingBox // Spatial filter
  hasGeometry?: boolean // Geometry presence
  groupId?: string // Filter by group
}

export interface LayerSearchResult {
  layers: LayerDefinition[]
  totalCount: number
  hasMore: boolean
  searchTime: number // Milliseconds
}
