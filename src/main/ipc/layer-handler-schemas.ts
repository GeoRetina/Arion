import { z } from 'zod'
import type { LayerDefinition, LayerGroup } from '../../shared/types/layer-types'

export const registerGeoTiffAssetSchema = z.object({
  sourcePath: z.string().trim().min(1).max(4096),
  jobId: z.string().uuid().optional()
})

export const importGeoPackageSchema = z.object({
  sourcePath: z.string().trim().min(1).max(4096)
})

export const importLocalLayerSchema = z.object({
  sourcePath: z.string().trim().min(1).max(4096),
  layerName: z.string().trim().min(1).max(256).optional(),
  geotiffJobId: z.string().uuid().optional()
})

export const registerVectorAssetSchema = z.object({
  sourcePath: z.string().trim().min(1).max(4096),
  format: z.enum(['geojson', 'shapefile', 'geopackage'])
})

export const releaseGeoTiffAssetSchema = z.object({
  assetId: z.string().uuid()
})

export const releaseVectorAssetSchema = z.object({
  assetId: z.string().uuid()
})

export const geoTiffAssetStatusSchema = z.object({
  jobId: z.string().uuid()
})

export const entityIdSchema = z.string().trim().min(1).max(256)
export const optionalEntityIdSchema = entityIdSchema.optional()
export const layerIdArraySchema = z.array(entityIdSchema).max(10_000)
export const layerImportDataSchema = z.string().trim().min(1).max(10_000_000)

const layerTypeSchema = z.enum(['raster', 'vector'])
const layerOriginSchema = z.enum(['user', 'tool', 'mcp', 'import'])
const layerSourceTypeSchema = z.enum([
  'geojson',
  'raster',
  'vector-tiles',
  'image',
  'wms',
  'wmts',
  'xyz'
])
const lineCapSchema = z.enum(['butt', 'round', 'square'])
const lineJoinSchema = z.enum(['bevel', 'round', 'miter'])
const textAnchorSchema = z.enum([
  'center',
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
])
const geometryTypeSchema = z.enum([
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'GeometryCollection'
])
const layerOperationTypeSchema = z.enum([
  'create',
  'update',
  'delete',
  'reorder',
  'group',
  'ungroup',
  'style-change',
  'visibility-toggle'
])
const layerErrorCodeSchema = z.enum([
  'LAYER_NOT_FOUND',
  'INVALID_LAYER_DATA',
  'SOURCE_LOAD_FAILED',
  'STYLE_APPLY_FAILED',
  'PERMISSION_DENIED',
  'QUOTA_EXCEEDED',
  'NETWORK_ERROR',
  'UNSUPPORTED_FORMAT',
  'INVALID_CREDENTIALS'
])

const parseDateLike = (value: unknown): Date => {
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value)
  }
  return new Date(Number.NaN)
}

const dateLikeSchema = z
  .unknown()
  .transform((value) => parseDateLike(value))
  .refine((value) => Number.isFinite(value.getTime()), 'Invalid date value')

const boundsSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite()
])

const layerCredentialsSchema = z
  .object({
    type: z.enum(['basic', 'bearer', 'api-key']),
    username: z.string().trim().max(512).optional(),
    password: z.string().trim().max(4096).optional(),
    token: z.string().trim().max(4096).optional(),
    apiKey: z.string().trim().max(4096).optional(),
    headers: z.record(z.string().trim().max(2048)).optional()
  })
  .strict()

const rasterRgbBandSelectionSchema = z
  .object({
    red: z.number().int().min(1).max(65_535),
    green: z.number().int().min(1).max(65_535),
    blue: z.number().int().min(1).max(65_535)
  })
  .strict()

export const renderGeoTiffTileSchema = z
  .object({
    assetId: z.string().uuid(),
    z: z.number().int().min(0).max(30),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    rgbBands: rasterRgbBandSelectionSchema.optional()
  })
  .strict()

const layerSourceOptionsSchema = z
  .object({
    tileSize: z.number().int().min(1).max(16384).optional(),
    maxZoom: z.number().int().min(0).max(30).optional(),
    minZoom: z.number().int().min(0).max(30).optional(),
    attribution: z.string().trim().max(8192).optional(),
    rasterAssetId: z.string().trim().max(256).optional(),
    rasterSourcePath: z.string().trim().max(4096).optional(),
    vectorAssetId: z.string().trim().max(256).optional(),
    vectorSourcePath: z.string().trim().max(4096).optional(),
    rasterBandCount: z.number().int().min(1).max(65_535).optional(),
    rasterRgbBands: rasterRgbBandSelectionSchema.optional(),
    scheme: z.enum(['xyz', 'tms']).optional(),
    bounds: boundsSchema.optional(),
    buffer: z.number().int().min(0).max(2048).optional(),
    tolerance: z.number().finite().min(0).max(1000).optional(),
    cluster: z.boolean().optional(),
    clusterMaxZoom: z.number().int().min(0).max(30).optional(),
    clusterRadius: z.number().int().min(0).max(1024).optional()
  })
  .strict()

const layerSourceConfigSchema = z
  .object({
    type: layerSourceTypeSchema,
    data: z.union([z.string().trim().min(1).max(10_000_000), z.record(z.unknown())]),
    mcpServerId: z.string().trim().min(1).max(256).optional(),
    credentials: layerCredentialsSchema.optional(),
    options: layerSourceOptionsSchema.optional()
  })
  .strict()

const layerStyleSchema = z
  .object({
    pointRadius: z.number().finite().min(0).max(1000).optional(),
    pointColor: z.string().trim().max(64).optional(),
    pointOpacity: z.number().finite().min(0).max(1).optional(),
    pointStrokeColor: z.string().trim().max(64).optional(),
    pointStrokeWidth: z.number().finite().min(0).max(1000).optional(),
    pointStrokeOpacity: z.number().finite().min(0).max(1).optional(),
    lineColor: z.string().trim().max(64).optional(),
    lineWidth: z.number().finite().min(0).max(1000).optional(),
    lineOpacity: z.number().finite().min(0).max(1).optional(),
    lineDasharray: z.array(z.number().finite().min(0).max(1000)).max(32).optional(),
    lineOffset: z.number().finite().min(-10000).max(10000).optional(),
    lineCap: lineCapSchema.optional(),
    lineJoin: lineJoinSchema.optional(),
    fillColor: z.string().trim().max(64).optional(),
    fillOpacity: z.number().finite().min(0).max(1).optional(),
    fillOutlineColor: z.string().trim().max(64).optional(),
    fillPattern: z.string().trim().max(512).optional(),
    rasterOpacity: z.number().finite().min(0).max(1).optional(),
    rasterHueRotate: z.number().finite().min(-360).max(360).optional(),
    rasterBrightnessMin: z.number().finite().min(-10).max(10).optional(),
    rasterBrightnessMax: z.number().finite().min(-10).max(10).optional(),
    rasterSaturation: z.number().finite().min(-10).max(10).optional(),
    rasterContrast: z.number().finite().min(-10).max(10).optional(),
    rasterFadeDuration: z.number().finite().min(0).max(60_000).optional(),
    textField: z.string().trim().max(10_000).optional(),
    textFont: z.array(z.string().trim().max(256)).max(32).optional(),
    textSize: z.number().finite().min(0).max(1000).optional(),
    textColor: z.string().trim().max(64).optional(),
    textHaloColor: z.string().trim().max(64).optional(),
    textHaloWidth: z.number().finite().min(0).max(1000).optional(),
    textOffset: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    textAnchor: textAnchorSchema.optional(),
    iconImage: z.string().trim().max(2048).optional(),
    iconSize: z.number().finite().min(0).max(1000).optional(),
    iconRotate: z.number().finite().min(-360).max(360).optional(),
    iconOpacity: z.number().finite().min(0).max(1).optional(),
    iconOffset: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    filter: z.array(z.unknown()).max(10_000).optional(),
    layout: z.record(z.unknown()).optional(),
    paint: z.record(z.unknown()).optional()
  })
  .strict()

const layerMetadataSchema = z
  .object({
    description: z.string().trim().max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(256)).max(500).default([]),
    source: z.string().trim().max(4096).optional(),
    license: z.string().trim().max(1024).optional(),
    geometryType: geometryTypeSchema.optional(),
    featureCount: z.number().int().min(0).max(1_000_000_000).optional(),
    bounds: boundsSchema.optional(),
    crs: z.string().trim().max(128).optional(),
    attributes: z.record(z.unknown()).optional(),
    statistics: z.record(z.unknown()).optional(),
    temporalExtent: z.record(z.unknown()).optional(),
    quality: z.record(z.unknown()).optional(),
    context: z.record(z.unknown()).optional()
  })
  .strict()

export const layerCreateSchema = z
  .object({
    id: entityIdSchema.optional(),
    name: z.string().trim().min(1).max(256),
    type: layerTypeSchema,
    sourceId: z.string().trim().min(1).max(256),
    sourceConfig: layerSourceConfigSchema,
    style: layerStyleSchema,
    visibility: z.boolean(),
    opacity: z.number().finite().min(0).max(1),
    zIndex: z.number().int().min(-1_000_000).max(1_000_000),
    metadata: layerMetadataSchema,
    groupId: optionalEntityIdSchema,
    isLocked: z.boolean(),
    createdBy: layerOriginSchema
  })
  .strict()

export const layerUpdateInputSchema = z
  .object({
    id: entityIdSchema.optional(),
    createdAt: dateLikeSchema.optional(),
    updatedAt: dateLikeSchema.optional(),
    name: z.string().trim().min(1).max(256).optional(),
    type: layerTypeSchema.optional(),
    sourceId: z.string().trim().min(1).max(256).optional(),
    sourceConfig: layerSourceConfigSchema.optional(),
    style: layerStyleSchema.optional(),
    visibility: z.boolean().optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    zIndex: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    metadata: layerMetadataSchema.optional(),
    groupId: optionalEntityIdSchema,
    isLocked: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) =>
      [
        'name',
        'type',
        'sourceId',
        'sourceConfig',
        'style',
        'visibility',
        'opacity',
        'zIndex',
        'metadata',
        'groupId',
        'isLocked'
      ].some((key) => key in value),
    'At least one updatable layer field must be provided'
  )

export const layerGroupCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    parentId: optionalEntityIdSchema,
    displayOrder: z.number().int().min(-1_000_000).max(1_000_000),
    expanded: z.boolean(),
    color: z.string().trim().max(64).optional(),
    description: z.string().trim().max(5000).optional()
  })
  .strict()

export const layerGroupUpdateInputSchema = z
  .object({
    id: entityIdSchema.optional(),
    createdAt: dateLikeSchema.optional(),
    updatedAt: dateLikeSchema.optional(),
    layerIds: z.array(entityIdSchema).max(10_000).optional(),
    name: z.string().trim().min(1).max(256).optional(),
    parentId: optionalEntityIdSchema,
    displayOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    expanded: z.boolean().optional(),
    color: z.string().trim().max(64).optional(),
    description: z.string().trim().max(5000).optional()
  })
  .strict()
  .refine(
    (value) =>
      ['name', 'parentId', 'displayOrder', 'expanded', 'color', 'description'].some(
        (key) => key in value
      ),
    'At least one updatable group field must be provided'
  )

export const layerSearchCriteriaSchema = z
  .object({
    query: z.string().trim().max(2000).optional(),
    type: layerTypeSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(256)).max(500).optional(),
    createdBy: layerOriginSchema.optional(),
    dateRange: z
      .object({
        start: dateLikeSchema,
        end: dateLikeSchema
      })
      .strict()
      .refine((value) => value.start.getTime() <= value.end.getTime(), 'Invalid date range')
      .optional(),
    bounds: boundsSchema.optional(),
    hasGeometry: z.boolean().optional(),
    groupId: optionalEntityIdSchema
  })
  .strict()

export const layerOperationSchema = z
  .object({
    type: layerOperationTypeSchema,
    layerId: entityIdSchema,
    changes: layerUpdateInputSchema.optional(),
    timestamp: dateLikeSchema,
    userId: z.string().trim().min(1).max(256).optional()
  })
  .strict()

export const layerErrorSchema = z
  .object({
    code: layerErrorCodeSchema,
    message: z.string().trim().min(1).max(5000),
    details: z.unknown().optional(),
    layerId: optionalEntityIdSchema,
    timestamp: dateLikeSchema
  })
  .strict()

export const stylePresetCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    description: z.string().trim().max(5000).optional(),
    layerType: layerTypeSchema,
    geometryType: geometryTypeSchema.optional(),
    style: layerStyleSchema,
    preview: z.string().max(20_000_000).optional(),
    isBuiltIn: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(256)).max(500)
  })
  .strict()

export const layerPerformanceMetricsSchema = z
  .object({
    layerId: entityIdSchema,
    loadTime: z.number().finite().min(0).max(3_600_000),
    renderTime: z.number().finite().min(0).max(3_600_000),
    memoryUsage: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
    featureCount: z.number().int().min(0).max(1_000_000_000),
    timestamp: dateLikeSchema
  })
  .strict()

type LayerUpdateInput = z.infer<typeof layerUpdateInputSchema>
type LayerGroupUpdateInput = z.infer<typeof layerGroupUpdateInputSchema>

export const sanitizeLayerUpdates = (updates: LayerUpdateInput): Partial<LayerDefinition> => {
  const sanitized: Partial<LayerDefinition> = {}
  if (typeof updates.name === 'string') sanitized.name = updates.name
  if (typeof updates.type === 'string') sanitized.type = updates.type
  if (typeof updates.sourceId === 'string') sanitized.sourceId = updates.sourceId
  if (updates.sourceConfig) sanitized.sourceConfig = updates.sourceConfig
  if (updates.style) sanitized.style = updates.style
  if (typeof updates.visibility === 'boolean') sanitized.visibility = updates.visibility
  if (typeof updates.opacity === 'number') sanitized.opacity = updates.opacity
  if (typeof updates.zIndex === 'number') sanitized.zIndex = updates.zIndex
  if (updates.metadata) sanitized.metadata = updates.metadata as LayerDefinition['metadata']
  if ('groupId' in updates) sanitized.groupId = updates.groupId
  if (typeof updates.isLocked === 'boolean') sanitized.isLocked = updates.isLocked
  return sanitized
}

export const sanitizeGroupUpdates = (updates: LayerGroupUpdateInput): Partial<LayerGroup> => {
  const sanitized: Partial<LayerGroup> = {}
  if (typeof updates.name === 'string') sanitized.name = updates.name
  if ('parentId' in updates) sanitized.parentId = updates.parentId
  if (typeof updates.displayOrder === 'number') sanitized.displayOrder = updates.displayOrder
  if (typeof updates.expanded === 'boolean') sanitized.expanded = updates.expanded
  if (typeof updates.color === 'string') sanitized.color = updates.color
  if (typeof updates.description === 'string') sanitized.description = updates.description
  return sanitized
}

export const bulkLayerUpdateSchema = z
  .array(
    z.object({
      id: entityIdSchema,
      changes: layerUpdateInputSchema
    })
  )
  .max(10_000)
