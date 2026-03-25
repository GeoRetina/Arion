/**
 * Layer Management IPC Handlers
 *
 * Handles communication between renderer and main process for layer operations.
 * Provides a clean interface to the layer database and processing services.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getLayerDbService, cleanupLayerDbService } from '../services/layer-database-service'
import { z } from 'zod'
import { LocalLayerImportService } from '../services/layers/local-layer-import-service'
import { getRasterTileService } from '../services/raster/raster-tile-service'
import type { RegisterGeoTiffAssetRequest } from '../services/raster/raster-types'
import { getGeoPackageImportService } from '../services/vector/geopackage-import-service'
import { getVectorAssetService } from '../services/vector/vector-asset-service'
import type {
  ImportGeoPackageRequest,
  ImportGeoPackageResult,
  ImportLocalLayerRequest,
  RenderGeoTiffTileRequest,
  RegisterVectorAssetRequest,
  RegisterVectorAssetResult
} from '../../shared/ipc-types'
import type {
  LayerCreateInput,
  LayerDefinition,
  LayerGroup,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerError,
  LayerOperation,
  StylePreset,
  LayerPerformanceMetrics
} from '../../shared/types/layer-types'
import { getRasterAssetId, getVectorAssetId } from '../../shared/lib/layer-asset-ids'
import {
  bulkLayerUpdateSchema,
  entityIdSchema,
  geoTiffAssetStatusSchema,
  importGeoPackageSchema,
  importLocalLayerSchema,
  layerCreateSchema,
  layerErrorSchema,
  layerGroupCreateSchema,
  layerGroupUpdateInputSchema,
  layerIdArraySchema,
  layerImportDataSchema,
  layerOperationSchema,
  layerPerformanceMetricsSchema,
  layerSearchCriteriaSchema,
  layerUpdateInputSchema,
  optionalEntityIdSchema,
  registerGeoTiffAssetSchema,
  registerVectorAssetSchema,
  releaseGeoTiffAssetSchema,
  releaseVectorAssetSchema,
  renderGeoTiffTileSchema,
  sanitizeGroupUpdates,
  sanitizeLayerUpdates,
  stylePresetCreateSchema
} from './layer-handler-schemas'

// Runtime (in-memory) layer snapshot pushed from the renderer's layer store.
let runtimeLayerSnapshot: unknown[] = []

export function getRuntimeLayerSnapshot(): unknown[] {
  return runtimeLayerSnapshot
}

/**
 * Register all layer-related IPC handlers
 */
export function registerLayerHandlers(): void {
  const dbService = getLayerDbService()
  const rasterTileService = getRasterTileService()
  const geoPackageImportService = getGeoPackageImportService()
  const vectorAssetService = getVectorAssetService()
  const localLayerImportService = new LocalLayerImportService()

  void cleanupOrphanedRasterAssets(dbService.getAllLayers(), rasterTileService)

  // Layer CRUD handlers
  ipcMain.handle('layers:getAll', async (): Promise<LayerDefinition[]> => {
    return dbService.getAllLayers()
  })

  ipcMain.handle(
    'layers:getById',
    async (_event: IpcMainInvokeEvent, id: string): Promise<LayerDefinition | null> => {
      const parsedId = entityIdSchema.parse(id)
      return dbService.getLayerById(parsedId) || null
    }
  )

  ipcMain.handle(
    'layers:create',
    async (_event: IpcMainInvokeEvent, layer: LayerCreateInput): Promise<LayerDefinition> => {
      const parsedLayer = layerCreateSchema.parse(layer) as LayerCreateInput
      return dbService.createLayer(parsedLayer)
    }
  )

  ipcMain.handle(
    'layers:update',
    async (
      _event: IpcMainInvokeEvent,
      id: string,
      updates: Partial<LayerDefinition>
    ): Promise<LayerDefinition> => {
      const parsedId = entityIdSchema.parse(id)
      const parsedUpdates = layerUpdateInputSchema.parse(updates)
      const safeUpdates = sanitizeLayerUpdates(parsedUpdates)
      return dbService.updateLayer(parsedId, safeUpdates)
    }
  )

  ipcMain.handle(
    'layers:delete',
    async (_event: IpcMainInvokeEvent, id: string): Promise<boolean> => {
      const parsedId = entityIdSchema.parse(id)
      const existingLayer = dbService.getLayerById(parsedId)
      const deleted = dbService.deleteLayer(parsedId)

      if (deleted && existingLayer) {
        const remainingLayers = dbService.getAllLayers()
        const assetId = getRasterAssetId(existingLayer)
        if (assetId) {
          if (!hasRasterAssetReference(remainingLayers, assetId)) {
            try {
              await rasterTileService.releaseGeoTiffAsset(assetId)
            } catch (error) {
              console.warn(`Failed to release raster asset ${assetId}:`, error)
            }
          }
        }

        const vectorAssetId = getVectorAssetId(existingLayer)
        if (vectorAssetId) {
          if (!hasVectorAssetReference(remainingLayers, vectorAssetId)) {
            try {
              await vectorAssetService.releaseVectorAsset(vectorAssetId)
            } catch (error) {
              console.warn(`Failed to release vector asset ${vectorAssetId}:`, error)
            }
          }
        }
      }

      return deleted
    }
  )

  // Group handlers
  ipcMain.handle('layers:groups:getAll', async (): Promise<LayerGroup[]> => {
    return dbService.getAllGroups()
  })

  ipcMain.handle(
    'layers:groups:create',
    async (
      _event: IpcMainInvokeEvent,
      group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>
    ): Promise<LayerGroup> => {
      const parsedGroup = layerGroupCreateSchema.parse(group)
      return dbService.createGroup(parsedGroup)
    }
  )

  ipcMain.handle(
    'layers:groups:update',
    async (
      _event: IpcMainInvokeEvent,
      id: string,
      updates: Partial<LayerGroup>
    ): Promise<LayerGroup> => {
      const parsedId = entityIdSchema.parse(id)
      const parsedUpdates = layerGroupUpdateInputSchema.parse(updates)
      const safeUpdates = sanitizeGroupUpdates(parsedUpdates)
      return dbService.updateGroup(parsedId, safeUpdates)
    }
  )

  ipcMain.handle(
    'layers:groups:delete',
    async (_event: IpcMainInvokeEvent, id: string, moveLayersTo?: string): Promise<boolean> => {
      const parsedId = entityIdSchema.parse(id)
      const parsedMoveLayersTo = optionalEntityIdSchema.parse(moveLayersTo)
      return dbService.deleteGroup(parsedId, parsedMoveLayersTo)
    }
  )

  // Search and filtering
  ipcMain.handle(
    'layers:search',
    async (
      _event: IpcMainInvokeEvent,
      criteria: LayerSearchCriteria
    ): Promise<LayerSearchResult> => {
      const parsedCriteria = layerSearchCriteriaSchema.parse(criteria)
      return dbService.searchLayers(parsedCriteria)
    }
  )

  // Operations and errors
  ipcMain.handle(
    'layers:logOperation',
    async (_event: IpcMainInvokeEvent, operation: LayerOperation): Promise<void> => {
      const parsedOperation = layerOperationSchema.parse(operation) as LayerOperation
      dbService.logOperation(parsedOperation)
    }
  )

  ipcMain.handle(
    'layers:getOperations',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<LayerOperation[]> => {
      const parsedLayerId = optionalEntityIdSchema.parse(layerId)
      return dbService.getOperations(parsedLayerId)
    }
  )

  ipcMain.handle(
    'layers:logError',
    async (_event: IpcMainInvokeEvent, error: LayerError): Promise<void> => {
      const parsedError = layerErrorSchema.parse(error)
      dbService.logError(parsedError)
    }
  )

  ipcMain.handle(
    'layers:getErrors',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<LayerError[]> => {
      const parsedLayerId = optionalEntityIdSchema.parse(layerId)
      return dbService.getErrors(parsedLayerId)
    }
  )

  ipcMain.handle(
    'layers:clearErrors',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<void> => {
      const parsedLayerId = optionalEntityIdSchema.parse(layerId)
      dbService.clearErrors(parsedLayerId)
    }
  )

  // Style presets
  ipcMain.handle('layers:presets:getAll', async (): Promise<StylePreset[]> => {
    return dbService.getAllStylePresets()
  })

  ipcMain.handle(
    'layers:presets:create',
    async (
      _event: IpcMainInvokeEvent,
      preset: Omit<StylePreset, 'id' | 'createdAt'>
    ): Promise<StylePreset> => {
      const parsedPreset = stylePresetCreateSchema.parse(preset)
      return dbService.createStylePreset(parsedPreset)
    }
  )

  // Performance metrics
  ipcMain.handle(
    'layers:recordMetrics',
    async (_event: IpcMainInvokeEvent, metrics: LayerPerformanceMetrics): Promise<void> => {
      const parsedMetrics = layerPerformanceMetricsSchema.parse(metrics)
      dbService.recordPerformanceMetrics(parsedMetrics)
    }
  )

  // Bulk operations
  ipcMain.handle(
    'layers:bulkUpdate',
    async (
      _event: IpcMainInvokeEvent,
      updates: Array<{ id: string; changes: Partial<LayerDefinition> }>
    ): Promise<void> => {
      const parsedUpdates = bulkLayerUpdateSchema.parse(updates)
      const safeUpdates = parsedUpdates.map((entry) => ({
        id: entry.id,
        changes: sanitizeLayerUpdates(entry.changes)
      }))
      dbService.bulkUpdateLayers(safeUpdates)
    }
  )

  ipcMain.handle(
    'layers:export',
    async (_event: IpcMainInvokeEvent, layerIds: string[]): Promise<string> => {
      const parsedLayerIds = layerIdArraySchema.parse(layerIds)
      return dbService.exportLayers(parsedLayerIds)
    }
  )

  ipcMain.handle(
    'layers:import',
    async (_event: IpcMainInvokeEvent, data: string, targetGroupId?: string): Promise<string[]> => {
      const parsedData = layerImportDataSchema.parse(data)
      const parsedTargetGroupId = optionalEntityIdSchema.parse(targetGroupId)
      return dbService.importLayers(parsedData, parsedTargetGroupId)
    }
  )

  ipcMain.handle(
    'layers:importGeoPackage',
    async (
      _event: IpcMainInvokeEvent,
      request: ImportGeoPackageRequest
    ): Promise<ImportGeoPackageResult> => {
      const parsedRequest = importGeoPackageSchema.parse(request)
      return await geoPackageImportService.importFile(parsedRequest.sourcePath)
    }
  )

  ipcMain.handle(
    'layers:importLocalLayer',
    async (
      _event: IpcMainInvokeEvent,
      request: ImportLocalLayerRequest
    ): Promise<LayerCreateInput> => {
      const parsedRequest = importLocalLayerSchema.parse(request)
      return await localLayerImportService.importPath(parsedRequest.sourcePath, {
        layerName: parsedRequest.layerName,
        geotiffJobId: parsedRequest.geotiffJobId
      })
    }
  )

  ipcMain.handle(
    'layers:registerVectorAsset',
    async (
      _event: IpcMainInvokeEvent,
      request: RegisterVectorAssetRequest
    ): Promise<RegisterVectorAssetResult> => {
      const parsedRequest = registerVectorAssetSchema.parse(request)
      return await vectorAssetService.registerVectorAsset(parsedRequest)
    }
  )

  // GeoTIFF tiling
  ipcMain.handle(
    'layers:registerGeoTiffAsset',
    async (_event: IpcMainInvokeEvent, request: RegisterGeoTiffAssetRequest) => {
      const parsedRequest = registerGeoTiffAssetSchema.parse(request)
      return await rasterTileService.registerGeoTiffAsset(parsedRequest)
    }
  )

  ipcMain.handle(
    'layers:renderGeoTiffTile',
    async (_event: IpcMainInvokeEvent, request: RenderGeoTiffTileRequest) => {
      const parsedRequest = renderGeoTiffTileSchema.parse(request)
      return await rasterTileService.renderTile(parsedRequest)
    }
  )

  ipcMain.handle(
    'layers:releaseGeoTiffAsset',
    async (_event: IpcMainInvokeEvent, assetId: string) => {
      const parsedRequest = releaseGeoTiffAssetSchema.parse({ assetId })
      if (!hasRasterAssetReference(dbService.getAllLayers(), parsedRequest.assetId)) {
        await rasterTileService.releaseGeoTiffAsset(parsedRequest.assetId)
      }
      return true
    }
  )

  ipcMain.handle(
    'layers:releaseVectorAsset',
    async (_event: IpcMainInvokeEvent, assetId: string) => {
      const parsedRequest = releaseVectorAssetSchema.parse({ assetId })
      if (!hasVectorAssetReference(dbService.getAllLayers(), parsedRequest.assetId)) {
        await vectorAssetService.releaseVectorAsset(parsedRequest.assetId)
      }
      return true
    }
  )

  ipcMain.handle(
    'layers:getGeoTiffAssetStatus',
    async (_event: IpcMainInvokeEvent, jobId: string) => {
      const parsedRequest = geoTiffAssetStatusSchema.parse({ jobId })
      return rasterTileService.getGeoTiffAssetStatus(parsedRequest.jobId)
    }
  )

  // Renderer pushes its current in-memory layer store snapshot here.
  ipcMain.handle(
    'layers:runtime:updateSnapshot',
    async (_event: IpcMainInvokeEvent, layers: unknown[]): Promise<boolean> => {
      runtimeLayerSnapshot = z.array(z.unknown()).parse(layers)
      return true
    }
  )
}

/**
 * Clean up layer handlers and close database connections
 */
export function cleanupLayerHandlers(): void {
  cleanupLayerDbService()
}

// Export database service getter for other services that need direct access
export { getLayerDbService as getLayerDbManager }

function hasRasterAssetReference(layers: LayerDefinition[], assetId: string): boolean {
  return layers.some((layer) => getRasterAssetId(layer) === assetId)
}

function hasVectorAssetReference(layers: LayerDefinition[], assetId: string): boolean {
  return layers.some((layer) => getVectorAssetId(layer) === assetId)
}

async function cleanupOrphanedRasterAssets(
  layers: LayerDefinition[],
  rasterTileService: ReturnType<typeof getRasterTileService>
): Promise<void> {
  const referencedAssetIds = new Set<string>()
  for (const layer of layers) {
    const assetId = getRasterAssetId(layer)
    if (assetId) {
      referencedAssetIds.add(assetId)
    }
  }

  try {
    await rasterTileService.cleanupOrphanedAssets(referencedAssetIds)
  } catch (error) {
    console.warn('Failed to clean up orphaned raster assets:', error)
  }
}
