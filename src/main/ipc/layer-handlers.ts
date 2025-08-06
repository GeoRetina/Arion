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

/**
 * Register all layer-related IPC handlers
 */
export function registerLayerHandlers(): void {
  const dbService = getLayerDbService()
  const processingService = getLayerProcessingService()

  // Layer CRUD handlers
  ipcMain.handle('layers:getAll', async (): Promise<LayerDefinition[]> => {
    try {
      return dbService.getAllLayers()
    } catch (error) {
      throw error
    }
  })

  ipcMain.handle(
    'layers:getById',
    async (_event: IpcMainInvokeEvent, id: string): Promise<LayerDefinition | null> => {
      try {
        return dbService.getLayerById(id) || null
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:create',
    async (
      _event: IpcMainInvokeEvent,
      layer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<LayerDefinition> => {
      try {
        return dbService.createLayer(layer)
      } catch (error) {
        throw error
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
      try {
        return dbService.updateLayer(id, updates)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:delete',
    async (_event: IpcMainInvokeEvent, id: string): Promise<boolean> => {
      try {
        return dbService.deleteLayer(id)
      } catch (error) {
        throw error
      }
    }
  )

  // Group handlers
  ipcMain.handle('layers:groups:getAll', async (): Promise<LayerGroup[]> => {
    try {
      return dbService.getAllGroups()
    } catch (error) {
      throw error
    }
  })

  ipcMain.handle(
    'layers:groups:create',
    async (
      _event: IpcMainInvokeEvent,
      group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>
    ): Promise<LayerGroup> => {
      try {
        return dbService.createGroup(group)
      } catch (error) {
        throw error
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
      try {
        return dbService.updateGroup(id, updates)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:groups:delete',
    async (_event: IpcMainInvokeEvent, id: string, moveLayersTo?: string): Promise<boolean> => {
      try {
        return dbService.deleteGroup(id, moveLayersTo)
      } catch (error) {
        throw error
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
      try {
        return dbService.searchLayers(criteria)
      } catch (error) {
        throw error
      }
    }
  )

  // Operations and errors
  ipcMain.handle(
    'layers:logOperation',
    async (_event: IpcMainInvokeEvent, operation: LayerOperation): Promise<void> => {
      try {
        dbService.logOperation(operation)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:getOperations',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<LayerOperation[]> => {
      try {
        return dbService.getOperations(layerId)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:logError',
    async (_event: IpcMainInvokeEvent, error: LayerError): Promise<void> => {
      try {
        dbService.logError(error)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:getErrors',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<LayerError[]> => {
      try {
        return dbService.getErrors(layerId)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:clearErrors',
    async (_event: IpcMainInvokeEvent, layerId?: string): Promise<void> => {
      try {
        dbService.clearErrors(layerId)
      } catch (error) {
        throw error
      }
    }
  )

  // Style presets
  ipcMain.handle('layers:presets:getAll', async (): Promise<StylePreset[]> => {
    try {
      return dbService.getAllStylePresets()
    } catch (error) {
      throw error
    }
  })

  ipcMain.handle(
    'layers:presets:create',
    async (
      _event: IpcMainInvokeEvent,
      preset: Omit<StylePreset, 'id' | 'createdAt'>
    ): Promise<StylePreset> => {
      try {
        return dbService.createStylePreset(preset)
      } catch (error) {
        throw error
      }
    }
  )

  // Performance metrics
  ipcMain.handle(
    'layers:recordMetrics',
    async (_event: IpcMainInvokeEvent, metrics: LayerPerformanceMetrics): Promise<void> => {
      try {
        dbService.recordPerformanceMetrics(metrics)
      } catch (error) {
        throw error
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
      try {
        dbService.bulkUpdateLayers(updates)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:export',
    async (_event: IpcMainInvokeEvent, layerIds: string[]): Promise<string> => {
      try {
        return dbService.exportLayers(layerIds)
      } catch (error) {
        throw error
      }
    }
  )

  ipcMain.handle(
    'layers:import',
    async (_event: IpcMainInvokeEvent, data: string, targetGroupId?: string): Promise<string[]> => {
      try {
        return dbService.importLayers(data, targetGroupId)
      } catch (error) {
        throw error
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
      try {
        return await processingService.processGeotiff(fileBuffer, fileName)
      } catch (error) {
        throw error
      }
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