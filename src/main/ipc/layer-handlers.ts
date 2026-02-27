/**
 * Layer Management IPC Handlers
 *
 * Handles communication between renderer and main process for layer operations.
 * Provides a clean interface to the layer database and processing services.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getLayerDbService, cleanupLayerDbService } from '../services/layer-database-service'
import { z } from 'zod'
import { getRasterTileService } from '../services/raster/raster-tile-service'
import type { RegisterGeoTiffAssetRequest } from '../services/raster/raster-types'
import type {
  LayerDefinition,
  LayerGroup,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerError,
  LayerOperation,
  StylePreset,
  LayerPerformanceMetrics
} from '../../shared/types/layer-types'

// Runtime (in-memory) layer snapshot pushed from the renderer's layer store.
let runtimeLayerSnapshot: unknown[] = []

export function getRuntimeLayerSnapshot(): unknown[] {
  return runtimeLayerSnapshot
}

const registerGeoTiffAssetSchema = z
  .object({
    fileName: z.string().min(1),
    filePath: z.string().min(1).optional(),
    fileBuffer: z.instanceof(ArrayBuffer).optional(),
    jobId: z.string().uuid().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.filePath && !value.fileBuffer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either filePath or fileBuffer must be provided'
      })
    }
  })

const releaseGeoTiffAssetSchema = z.object({
  assetId: z.string().uuid()
})

const geoTiffAssetStatusSchema = z.object({
  jobId: z.string().uuid()
})

/**
 * Register all layer-related IPC handlers
 */
export function registerLayerHandlers(): void {
  const dbService = getLayerDbService()
  const rasterTileService = getRasterTileService()

  void cleanupOrphanedRasterAssets(dbService.getAllLayers(), rasterTileService)

  // Layer CRUD handlers
  ipcMain.handle('layers:getAll', async (): Promise<LayerDefinition[]> => {
    {
      return dbService.getAllLayers()
    }
  })

  ipcMain.handle(
    'layers:getById',
    async (_event: IpcMainInvokeEvent, id: string): Promise<LayerDefinition | null> => {
      {
        return dbService.getLayerById(id) || null
      }
    }
  )

  ipcMain.handle(
    'layers:create',
    async (
      _event: IpcMainInvokeEvent,
      layer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<LayerDefinition> => {
      {
        return dbService.createLayer(layer)
      }
    }
  )

  ipcMain.handle(
    'layers:update',
    async (
      _event: IpcMainInvokeEvent,
      id: string,
      updates: Partial<LayerDefinition>
    ): Promise<LayerDefinition> => {
      {
        return dbService.updateLayer(id, updates)
      }
    }
  )

  ipcMain.handle(
    'layers:delete',
    async (_event: IpcMainInvokeEvent, id: string): Promise<boolean> => {
      const existingLayer = dbService.getLayerById(id)
      const deleted = dbService.deleteLayer(id)

      if (deleted && existingLayer) {
        const assetId = getRasterAssetId(existingLayer)
        if (assetId) {
          const remainingLayers = dbService.getAllLayers()
          if (!hasRasterAssetReference(remainingLayers, assetId)) {
            try {
              await rasterTileService.releaseGeoTiffAsset(assetId)
            } catch (error) {
              console.warn(`Failed to release raster asset ${assetId}:`, error)
            }
          }
        }
      }

      return deleted
    }
  )

  // Group handlers
  ipcMain.handle('layers:groups:getAll', async (): Promise<LayerGroup[]> => {
    {
      return dbService.getAllGroups()
    }
  })

  ipcMain.handle(
    'layers:groups:create',
    async (
      _event: IpcMainInvokeEvent,
      group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>
    ): Promise<LayerGroup> => {
      {
        return dbService.createGroup(group)
      }
    }
  )

  ipcMain.handle(
    'layers:groups:update',
    async (
      _event: IpcMainInvokeEvent,
      id: string,
      updates: Partial<LayerGroup>
    ): Promise<LayerGroup> => {
      {
        return dbService.updateGroup(id, updates)
      }
    }
  )

  ipcMain.handle(
    'layers:groups:delete',
    async (_event: IpcMainInvokeEvent, id: string, moveLayersTo?: string): Promise<boolean> => {
      {
        return dbService.deleteGroup(id, moveLayersTo)
      }
    }
  )

  // Search and filtering
  ipcMain.handle(
    'layers:search',
    async (
      _event: IpcMainInvokeEvent,
      criteria: LayerSearchCriteria
    ): Promise<LayerSearchResult> => {
      {
        return dbService.searchLayers(criteria)
      }
    }
  )

  // Operations and errors
  ipcMain.handle(
    'layers:logOperation',
    async (_event: IpcMainInvokeEvent, operation: LayerOperation): Promise<void> => {
      {
        dbService.logOperation(operation)
      }
    }
  )

  ipcMain.handle(
    'layers:getOperations',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<LayerOperation[]> => {
      {
        return dbService.getOperations(layerId)
      }
    }
  )

  ipcMain.handle(
    'layers:logError',
    async (_event: IpcMainInvokeEvent, error: LayerError): Promise<void> => {
      {
        dbService.logError(error)
      }
    }
  )

  ipcMain.handle(
    'layers:getErrors',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<LayerError[]> => {
      {
        return dbService.getErrors(layerId)
      }
    }
  )

  ipcMain.handle(
    'layers:clearErrors',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<void> => {
      {
        dbService.clearErrors(layerId)
      }
    }
  )

  // Style presets
  ipcMain.handle('layers:presets:getAll', async (): Promise<StylePreset[]> => {
    {
      return dbService.getAllStylePresets()
    }
  })

  ipcMain.handle(
    'layers:presets:create',
    async (
      _event: IpcMainInvokeEvent,
      preset: Omit<StylePreset, 'id' | 'createdAt'>
    ): Promise<StylePreset> => {
      {
        return dbService.createStylePreset(preset)
      }
    }
  )

  // Performance metrics
  ipcMain.handle(
    'layers:recordMetrics',
    async (_event: IpcMainInvokeEvent, metrics: LayerPerformanceMetrics): Promise<void> => {
      {
        dbService.recordPerformanceMetrics(metrics)
      }
    }
  )

  // Bulk operations
  ipcMain.handle(
    'layers:bulkUpdate',
    async (
      _event: IpcMainInvokeEvent,
      updates: Array<{ id: string; changes: Partial<LayerDefinition> }>
    ): Promise<void> => {
      {
        dbService.bulkUpdateLayers(updates)
      }
    }
  )

  ipcMain.handle(
    'layers:export',
    async (_event: IpcMainInvokeEvent, layerIds: string[]): Promise<string> => {
      {
        return dbService.exportLayers(layerIds)
      }
    }
  )

  ipcMain.handle(
    'layers:import',
    async (_event: IpcMainInvokeEvent, data: string, targetGroupId?: string): Promise<string[]> => {
      {
        return dbService.importLayers(data, targetGroupId)
      }
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
    'layers:getGeoTiffAssetStatus',
    async (_event: IpcMainInvokeEvent, jobId: string) => {
      const parsedRequest = geoTiffAssetStatusSchema.parse({ jobId })
      return rasterTileService.getGeoTiffAssetStatus(parsedRequest.jobId)
    }
  )

  // Backward-compatible alias. New code should use layers:registerGeoTiffAsset.
  ipcMain.handle(
    'layers:processGeotiff',
    async (_event: IpcMainInvokeEvent, fileBuffer: ArrayBuffer, fileName: string) => {
      const parsedRequest = registerGeoTiffAssetSchema.parse({ fileBuffer, fileName })
      return await rasterTileService.registerGeoTiffAsset(parsedRequest)
    }
  )

  // Renderer pushes its current in-memory layer store snapshot here.
  ipcMain.handle(
    'layers:runtime:updateSnapshot',
    async (_event: IpcMainInvokeEvent, layers: unknown[]): Promise<boolean> => {
      runtimeLayerSnapshot = Array.isArray(layers) ? layers : []
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

function getRasterAssetId(layer: LayerDefinition): string | null {
  const assetId = layer.sourceConfig.options?.rasterAssetId
  if (typeof assetId !== 'string' || assetId.length === 0) {
    return null
  }

  return assetId
}

function getRasterSourcePath(layer: LayerDefinition): string | null {
  const sourcePath = layer.sourceConfig.options?.rasterSourcePath
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    return null
  }

  return sourcePath
}

function hasRasterAssetReference(layers: LayerDefinition[], assetId: string): boolean {
  return layers.some((layer) => getRasterAssetId(layer) === assetId)
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
      const sourcePath = getRasterSourcePath(layer)
      if (sourcePath) {
        await rasterTileService.bindGeoTiffAssetSourcePath(assetId, sourcePath)
      }
    }
  }

  try {
    await rasterTileService.cleanupOrphanedAssets(referencedAssetIds)
  } catch (error) {
    console.warn('Failed to clean up orphaned raster assets:', error)
  }
}
