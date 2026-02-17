/**
 * Layer Management IPC Handlers
 *
 * Handles communication between renderer and main process for layer operations.
 * Provides a clean interface to the layer database and processing services.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getLayerDbService, cleanupLayerDbService } from '../services/layer-database-service'
import { getLayerProcessingService } from '../services/layer-processing-service'
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
let runtimeLayerSnapshot: UnsafeAny[] = []

export function getRuntimeLayerSnapshot(): unknown[] {
  return runtimeLayerSnapshot
}

/**
 * Register all layer-related IPC handlers
 */
export function registerLayerHandlers(): void {
  const dbService = getLayerDbService()
  const processingService = getLayerProcessingService()

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
      {
        return dbService.deleteLayer(id)
      }
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

  // GeoTIFF processing
  ipcMain.handle(
    'layers:processGeotiff',
    async (
      _event: IpcMainInvokeEvent,
      fileBuffer: ArrayBuffer,
      fileName: string
    ): Promise<{ imageUrl: string; bounds?: [number, number, number, number] }> => {
      {
        return await processingService.processGeotiff(fileBuffer, fileName)
      }
    }
  )

  // Renderer pushes its current in-memory layer store snapshot here.
  ipcMain.handle(
    'layers:runtime:updateSnapshot',
    async (_event: IpcMainInvokeEvent, layers: UnsafeAny[]): Promise<boolean> => {
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
