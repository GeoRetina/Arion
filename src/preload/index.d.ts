import { ElectronAPI } from '@electron-toolkit/preload'
import type { UIMessage } from '@ai-sdk/react'
import type {
  LayerDefinition,
  LayerGroup,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerError,
  LayerOperation,
  StylePreset,
  LayerPerformanceMetrics
} from '../shared/types/layer-types'

// Define the structure of the chat request body, mirroring preload script
interface ChatRequestBodyForDTS {
  messages: UIMessage[]
  // other properties if added to ChatRequestBody in preload.ts
}

// Layer management API interface
export interface LayerApi {
  // Layer CRUD operations
  getAll: () => Promise<LayerDefinition[]>
  getById: (id: string) => Promise<LayerDefinition | null>
  create: (
    layer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<LayerDefinition>
  update: (id: string, updates: Partial<LayerDefinition>) => Promise<LayerDefinition>
  delete: (id: string) => Promise<boolean>

  // Group operations
  groups: {
    getAll: () => Promise<LayerGroup[]>
    create: (
      group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>
    ) => Promise<LayerGroup>
    update: (id: string, updates: Partial<LayerGroup>) => Promise<LayerGroup>
    delete: (id: string, moveLayersTo?: string) => Promise<boolean>
  }

  // Search and operations
  search: (criteria: LayerSearchCriteria) => Promise<LayerSearchResult>
  logOperation: (operation: LayerOperation) => Promise<void>
  getOperations: (layerId?: string) => Promise<LayerOperation[]>
  logError: (error: LayerError) => Promise<void>
  getErrors: (layerId?: string) => Promise<LayerError[]>
  clearErrors: (layerId?: string) => Promise<void>

  // Style presets
  presets: {
    getAll: () => Promise<StylePreset[]>
    create: (preset: Omit<StylePreset, 'id' | 'createdAt'>) => Promise<StylePreset>
  }

  // Performance and bulk operations
  recordMetrics: (metrics: LayerPerformanceMetrics) => Promise<void>
  bulkUpdate: (updates: Array<{ id: string; changes: Partial<LayerDefinition> }>) => Promise<void>
  export: (layerIds: string[]) => Promise<string>
  import: (data: string, targetGroupId?: string) => Promise<string[]>

  // Generic invoke method for additional operations
  invoke: (channel: string, ...args: UnsafeAny[]) => Promise<UnsafeAny>
}

// Import the full SettingsApi type from shared types
import type { SettingsApi } from '../shared/ipc-types'

// Define the shape of our custom ctgApi
export interface CtgApi {
  settings: SettingsApi
  chat: {
    sendMessageStream: (body: ChatRequestBodyForDTS | undefined) => Promise<Uint8Array[]>
  }
  layers: LayerApi
  // Define other namespaces and their functions here as they are added
}

declare global {
  interface Window {
    electron: ElectronAPI
    ctg: CtgApi // Changed 'api' to 'ctg' and used the CtgApi interface
  }
}
