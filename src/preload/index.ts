process.stderr.write('[Preload Script] Preload script executing.\n')

// REMOVED: throw new Error('[Preload Script] INTENTIONAL CRASH TO TEST EXECUTION')

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
// Import IPC types from the shared directory
import {
  IpcChannels,
  type OpenAIConfig,
  type GoogleConfig,
  type AzureConfig,
  type AnthropicConfig,
  type VertexConfig,
  type OllamaConfig,
  type EmbeddingConfig,
  type LLMProviderType,
  type AllLLMConfigurations,
  type McpServerConfig,
  type McpServerTestResult,
  type SettingsApi,
  type ChatApi,
  type Chat,
  type Message as DbMessage,
  type DbApi,
  type LayerApi,
  type AddMapFeaturePayload,
  type SetPaintPropertiesPayload,
  type RemoveSourceAndLayersPayload,
  type SetMapViewPayload,
  type SystemPromptConfig,
  type SkillPackConfig,
  type SkillPackInfo,
  type SkillPackTemplateBootstrapResult,
  type SetMapSidebarVisibilityPayload,
  type AddGeoreferencedImageLayerPayload,
  type KnowledgeBaseApi,
  type KBAddDocumentPayload,
  type KBAddDocumentResult,
  type ExposedShellApi,
  type McpPermissionApi,
  type McpPermissionRequest,
  type PostgreSQLApi,
  type PostgreSQLConfig,
  type PostgreSQLConnectionResult,
  type PostgreSQLQueryResult,
  type PostgreSQLConnectionInfo,
  type AgentApi,
  type PromptModuleApi,
  type AgentDefinition,
  type AgentRegistryEntry,
  type CreateAgentParams,
  type UpdateAgentParams,
  type PromptModule,
  type CreatePromptModuleParams,
  type UpdatePromptModuleParams,
  type PromptModuleInfo,
  type PromptAssemblyRequest,
  type PromptAssemblyResult,
  type OrchestrationResult,
  type OrchestrationStatus,
  type AgentCapabilitiesResult
} from '../shared/ipc-types' // Corrected relative path
import type {
  LayerDefinition,
  LayerGroup,
  LayerSearchCriteria,
  LayerSearchResult,
  LayerOperation,
  LayerError,
  StylePreset,
  LayerPerformanceMetrics
} from '../shared/types/layer-types'

// This ChatRequestBody is specific to preload, using @ai-sdk/react UIMessage
import type { UIMessage } from '@ai-sdk/react'
interface PreloadChatRequestBody {
  messages: UIMessage[]
  // other potential fields from useChat body
}

// Add EventEmitter for streaming support
import { EventEmitter } from 'events'

// Define MapApi type for preload
// export interface MapApi { // This local interface can be removed if ExposedMapApi is used directly for typing ctgApi.map
//   onAddFeature: (callback: (payload: AddMapFeaturePayload) => void) => () => void;
//   onSetPaintProperties: (callback: (payload: SetPaintPropertiesPayload) => void) => () => void;
// }

// Store active stream emitters
const streamEmitters = new Map<string, EventEmitter>()

// Custom APIs for renderer
const ctgApi = {
  orchestration: {
    orchestrateMessage: async (
      chatId: string,
      message: string,
      orchestratorAgentId: string
    ): Promise<OrchestrationResult> => {
      try {
        return await ipcRenderer.invoke(IpcChannels.orchestrateMessage, {
          chatId,
          message,
          orchestratorAgentId
        })
      } catch (error) {
        return {
          sessionId: '',
          finalResponse: '',
          subtasks: [],
          subtasksExecuted: 0,
          agentsInvolved: [],
          completionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error in orchestration'
        }
      }
    },

    getStatus: async (sessionId?: string): Promise<OrchestrationStatus> => {
      try {
        return await ipcRenderer.invoke(IpcChannels.getOrchestrationStatus, sessionId)
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error getting orchestration status'
        }
      }
    }
  },
  settings: {
    getSetting: async (key: string): Promise<unknown> => {
      {
        const result = await ipcRenderer.invoke('ctg:settings:get', key)
        return result
      }
    },
    setSetting: async (
      key: string,
      value: unknown
    ): Promise<{ success: boolean; error?: string }> => {
      {
        const result = await ipcRenderer.invoke('ctg:settings:set', key, value)
        return result
      }
    },
    setOpenAIConfig: (config: OpenAIConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setOpenAIConfig, config),
    getOpenAIConfig: (): Promise<OpenAIConfig | null> =>
      ipcRenderer.invoke(IpcChannels.getOpenAIConfig),
    setGoogleConfig: (config: GoogleConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setGoogleConfig, config),
    getGoogleConfig: (): Promise<GoogleConfig | null> =>
      ipcRenderer.invoke(IpcChannels.getGoogleConfig),
    setAzureConfig: (config: AzureConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setAzureConfig, config),
    getAzureConfig: (): Promise<AzureConfig | null> =>
      ipcRenderer.invoke(IpcChannels.getAzureConfig),
    setAnthropicConfig: (config: AnthropicConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setAnthropicConfig, config),
    getAnthropicConfig: (): Promise<AnthropicConfig | null> =>
      ipcRenderer.invoke(IpcChannels.getAnthropicConfig),
    setVertexConfig: (config: VertexConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setVertexConfig, config),
    getVertexConfig: (): Promise<VertexConfig | null> =>
      ipcRenderer.invoke(IpcChannels.getVertexConfig),
    setOllamaConfig: (config: OllamaConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setOllamaConfig, config),
    getOllamaConfig: (): Promise<OllamaConfig | null> =>
      ipcRenderer.invoke(IpcChannels.getOllamaConfig),
    setEmbeddingConfig: (config: EmbeddingConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setEmbeddingConfig, config),
    getEmbeddingConfig: (): Promise<EmbeddingConfig> =>
      ipcRenderer.invoke(IpcChannels.getEmbeddingConfig),
    setActiveLLMProvider: (provider: LLMProviderType | null): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setActiveLLMProvider, provider),
    getActiveLLMProvider: (): Promise<LLMProviderType | null> =>
      ipcRenderer.invoke(IpcChannels.getActiveLLMProvider),
    getAllLLMConfigs: (): Promise<AllLLMConfigurations> =>
      ipcRenderer.invoke(IpcChannels.getAllLLMConfigs),
    getMcpServerConfigs: (): Promise<McpServerConfig[]> =>
      ipcRenderer.invoke(IpcChannels.getMcpServerConfigs),
    addMcpServerConfig: (config: Omit<McpServerConfig, 'id'>): Promise<McpServerConfig | null> =>
      ipcRenderer.invoke(IpcChannels.addMcpServerConfig, config),
    updateMcpServerConfig: (
      configId: string,
      updates: Partial<Omit<McpServerConfig, 'id'>>
    ): Promise<McpServerConfig | null> =>
      ipcRenderer.invoke(IpcChannels.updateMcpServerConfig, configId, updates),
    deleteMcpServerConfig: (configId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.deleteMcpServerConfig, configId),
    testMcpServerConfig: (config: Omit<McpServerConfig, 'id'>): Promise<McpServerTestResult> =>
      ipcRenderer.invoke(IpcChannels.testMcpServerConfig, config),
    getSystemPromptConfig: (): Promise<SystemPromptConfig> =>
      ipcRenderer.invoke(IpcChannels.getSystemPromptConfig),
    setSystemPromptConfig: (config: SystemPromptConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setSystemPromptConfig, config),
    getSkillPackConfig: (): Promise<SkillPackConfig> =>
      ipcRenderer.invoke(IpcChannels.getSkillPackConfig),
    setSkillPackConfig: (config: SkillPackConfig): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.setSkillPackConfig, config),
    listAvailableSkills: (workspaceRoot?: string): Promise<SkillPackInfo[]> =>
      ipcRenderer.invoke(IpcChannels.listAvailableSkills, workspaceRoot),
    bootstrapWorkspaceTemplates: (
      workspaceRoot: string
    ): Promise<SkillPackTemplateBootstrapResult> =>
      ipcRenderer.invoke(IpcChannels.bootstrapWorkspaceTemplates, workspaceRoot)
  } as SettingsApi,
  chat: {
    sendMessageStream: async (body: PreloadChatRequestBody | undefined): Promise<Uint8Array[]> => {
      if (!body) {
        const errorMsg = '[Preload Chat] Request body is undefined in sendMessageStream'
        const textEncoder = new TextEncoder()
        return [textEncoder.encode(JSON.stringify({ streamError: errorMsg }))]
      }
      try {
        // This will still collect all chunks and return them at once
        const responseChunks = (await ipcRenderer.invoke(
          'ctg:chat:sendMessageStreamHandler',
          body
        )) as Uint8Array[]

        if (Array.isArray(responseChunks)) {
          return responseChunks
        } else {
          const errorMsg = 'Invalid data structure received from main process.'
          const textEncoder = new TextEncoder()
          return [textEncoder.encode(JSON.stringify({ streamError: errorMsg }))]
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const textEncoder = new TextEncoder()
        return [textEncoder.encode(JSON.stringify({ streamError: errorMsg }))]
      }
    },

    // NEW API METHOD: Uses event-based streaming instead of Promise-based
    startMessageStream: async (body: PreloadChatRequestBody | undefined): Promise<string> => {
      if (!body) {
        throw new Error('[Preload Chat] Request body is undefined in startMessageStream')
      }

      // Create a unique ID for this stream
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`

      // Create an event emitter for this stream
      const emitter = new EventEmitter()
      streamEmitters.set(streamId, emitter)

      // Register listeners for this stream
      ipcRenderer.on(`ctg:chat:stream:chunk:${streamId}`, (_event, chunk: Uint8Array) => {
        try {
          if (chunk instanceof Uint8Array) {
            emitter.emit('chunk', chunk)
          } else {
            emitter.emit('error', new Error('Invalid chunk type received'))
          }
        } catch (error) {
          emitter.emit('error', error)
        }
      })

      ipcRenderer.on(`ctg:chat:stream:error:${streamId}`, (_event, error: string) => {
        emitter.emit('error', new Error(error))
      })

      ipcRenderer.on(`ctg:chat:stream:start:${streamId}`, () => {
        emitter.emit('start')
      })

      ipcRenderer.on(`ctg:chat:stream:end:${streamId}`, () => {
        emitter.emit('end')
      })

      // Start the stream on the main process side
      ipcRenderer
        .invoke('ctg:chat:startMessageStream', streamId, JSON.stringify(body))
        .catch((error) => {
          emitter.emit('error', error)
        })

      return streamId
    },

    // Method to cancel a stream
    cancelStream: async (streamId: string): Promise<boolean> => {
      try {
        return await ipcRenderer.invoke('ctg:chat:cancelStream', streamId)
      } catch {
        return false
      }
    },

    // Methods to subscribe/unsubscribe from stream events
    subscribeToStream: (
      streamId: string,
      callbacks: {
        onChunk: (chunk: Uint8Array) => void
        onError?: (error: Error) => void
        onStart?: () => void
        onEnd?: () => void
      }
    ): (() => void) => {
      const emitter = streamEmitters.get(streamId)
      if (!emitter) {
        throw new Error(`No stream found with ID ${streamId}`)
      }

      // Add listeners
      emitter.on('chunk', callbacks.onChunk)
      if (callbacks.onError) emitter.on('error', callbacks.onError)
      if (callbacks.onStart) emitter.on('start', callbacks.onStart)
      if (callbacks.onEnd) emitter.on('end', callbacks.onEnd)

      // Return unsubscribe function
      return () => {
        emitter.removeListener('chunk', callbacks.onChunk)
        if (callbacks.onError) emitter.removeListener('error', callbacks.onError)
        if (callbacks.onStart) emitter.removeListener('start', callbacks.onStart)
        if (callbacks.onEnd) emitter.removeListener('end', callbacks.onEnd)

        // Check if all listeners are gone and clean up the emitter
        if (
          emitter.listenerCount('chunk') === 0 &&
          emitter.listenerCount('error') === 0 &&
          emitter.listenerCount('start') === 0 &&
          emitter.listenerCount('end') === 0
        ) {
          streamEmitters.delete(streamId)

          // Remove IPC listeners
          ipcRenderer.removeAllListeners(`ctg:chat:stream:chunk:${streamId}`)
          ipcRenderer.removeAllListeners(`ctg:chat:stream:error:${streamId}`)
          ipcRenderer.removeAllListeners(`ctg:chat:stream:start:${streamId}`)
          ipcRenderer.removeAllListeners(`ctg:chat:stream:end:${streamId}`)
        }
      }
    }
  } as ChatApi,
  db: {
    createChat: async (
      chatData: Pick<Chat, 'id'> & Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
    ): Promise<{ success: boolean; data?: Chat; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbCreateChat, chatData)
    },
    getChatById: async (
      id: string
    ): Promise<{ success: boolean; data?: Chat | null; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbGetChatById, id)
    },
    getAllChats: async (
      orderBy?: 'created_at' | 'updated_at',
      order?: 'ASC' | 'DESC'
    ): Promise<{ success: boolean; data?: Chat[]; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbGetAllChats, orderBy, order)
    },
    updateChat: async (
      id: string,
      updates: Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
    ): Promise<{ success: boolean; data?: Chat; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbUpdateChat, id, updates)
    },
    deleteChat: async (id: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbDeleteChat, id)
    },
    addMessage: async (
      messageData: Pick<DbMessage, 'id' | 'chat_id' | 'role' | 'content'> &
        Partial<Omit<DbMessage, 'id' | 'chat_id' | 'role' | 'content' | 'created_at'>>
    ): Promise<{ success: boolean; data?: DbMessage; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbAddMessage, messageData)
    },
    getMessageById: async (
      id: string
    ): Promise<{ success: boolean; data?: DbMessage | null; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbGetMessageById, id)
    },
    getMessagesByChatId: async (
      chat_id: string,
      orderBy?: 'created_at',
      order?: 'ASC' | 'DESC'
    ): Promise<{ success: boolean; data?: DbMessage[]; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbGetMessagesByChatId, chat_id, orderBy, order)
    },
    deleteMessage: async (id: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IpcChannels.dbDeleteMessage, id)
    }
  } as DbApi,
  knowledgeBase: {
    addDocument: (payload: KBAddDocumentPayload): Promise<KBAddDocumentResult> => {
      // Ensure documentId is set if not provided by the frontend,
      // though the new flow might always provide it from the store.
      // const fullPayload = { ...payload, documentId: payload.documentId || nanoid() };
      // The nanoid generation was moved to the main process if truly needed,
      // but with the PGlite refactor, the ID is critical and should come from the UI store
      // which gets it from the main process upon creation or is already known.
      // For addDocument, it's better if the frontend store initiates with a UUID.
      // However, knowledge-base.handlers.ts uses payload.documentId directly which is good.
      return ipcRenderer.invoke(IpcChannels.kbAddDocument, payload)
    },
    findSimilar: (query: string, limit?: number) =>
      ipcRenderer.invoke(IpcChannels.kbFindSimilar, query, limit),
    getChunkCount: () => ipcRenderer.invoke(IpcChannels.kbGetChunkCount),
    getAllDocuments: () => ipcRenderer.invoke(IpcChannels.kbGetAllDocuments),
    getWorkspaceMemories: (limit?: number) =>
      ipcRenderer.invoke(IpcChannels.kbGetWorkspaceMemories, limit),
    deleteDocument: (documentId: string) =>
      ipcRenderer.invoke(IpcChannels.kbDeleteDocument, documentId)
  } as KnowledgeBaseApi,
  shell: {
    openPath: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.shellOpenPath, filePath)
  } as ExposedShellApi,
  mcp: {
    requestPermission: (request: McpPermissionRequest): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.mcpRequestPermission, request),
    showPermissionDialog: (request: McpPermissionRequest): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.mcpShowPermissionDialog, request),
    permissionResponse: (requestId: string, granted: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.mcpPermissionResponse, requestId, granted),
    onShowPermissionDialog: (callback: (payload: McpPermissionRequest) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: McpPermissionRequest): void =>
        callback(payload)
      ipcRenderer.on('ctg:mcp:showPermissionDialog', handler)
      return () => {
        ipcRenderer.removeListener('ctg:mcp:showPermissionDialog', handler)
      }
    }
  } as McpPermissionApi,
  map: {
    onAddFeature: (callback: (payload: AddMapFeaturePayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AddMapFeaturePayload): void =>
        callback(payload)
      ipcRenderer.on('ctg:map:addFeature', handler)
      // Return a cleanup function to remove the listener
      return () => {
        ipcRenderer.removeListener('ctg:map:addFeature', handler)
      }
    },
    onSetPaintProperties: (callback: (payload: SetPaintPropertiesPayload) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: SetPaintPropertiesPayload
      ): void => callback(payload)
      ipcRenderer.on('ctg:map:setPaintProperties', handler)
      return () => {
        ipcRenderer.removeListener('ctg:map:setPaintProperties', handler)
      }
    },
    onRemoveSourceAndLayers: (callback: (payload: RemoveSourceAndLayersPayload) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: RemoveSourceAndLayersPayload
      ): void => callback(payload)
      ipcRenderer.on('ctg:map:removeSourceAndLayers', handler)
      return () => {
        ipcRenderer.removeListener('ctg:map:removeSourceAndLayers', handler)
      }
    },
    onSetView: (callback: (payload: SetMapViewPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: SetMapViewPayload): void =>
        callback(payload)
      ipcRenderer.on('ctg:map:setView', handler)
      return () => {
        ipcRenderer.removeListener('ctg:map:setView', handler)
      }
    },
    // Handler for adding georeferenced image layer
    onAddGeoreferencedImageLayer: (
      callback: (payload: AddGeoreferencedImageLayerPayload) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: AddGeoreferencedImageLayerPayload
      ): void => callback(payload)
      ipcRenderer.on('ctg:map:addGeoreferencedImageLayer', handler)
      return () => ipcRenderer.removeListener('ctg:map:addGeoreferencedImageLayer', handler)
    }
  },
  ui: {
    onSetMapSidebarVisibility: (callback: (payload: SetMapSidebarVisibilityPayload) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: SetMapSidebarVisibilityPayload
      ): void => callback(payload)
      ipcRenderer.on('ctg:ui:setMapSidebarVisibility', handler)
      return () => {
        ipcRenderer.removeListener('ctg:ui:setMapSidebarVisibility', handler)
      }
    }
  },
  postgresql: {
    testConnection: (config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> =>
      ipcRenderer.invoke(IpcChannels.postgresqlTestConnection, config),
    createConnection: (id: string, config: PostgreSQLConfig): Promise<PostgreSQLConnectionResult> =>
      ipcRenderer.invoke(IpcChannels.postgresqlCreateConnection, id, config),
    closeConnection: (id: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.postgresqlCloseConnection, id),
    executeQuery: (id: string, query: string, params?: unknown[]): Promise<PostgreSQLQueryResult> =>
      ipcRenderer.invoke(IpcChannels.postgresqlExecuteQuery, id, query, params),
    executeTransaction: (id: string, queries: string[]): Promise<PostgreSQLQueryResult> =>
      ipcRenderer.invoke(IpcChannels.postgresqlExecuteTransaction, id, queries),
    getActiveConnections: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.postgresqlGetActiveConnections),
    getConnectionInfo: (id: string): Promise<PostgreSQLConnectionInfo> =>
      ipcRenderer.invoke(IpcChannels.postgresqlGetConnectionInfo, id)
  } as PostgreSQLApi,
  layers: {
    // Layer CRUD operations
    getAll: (): Promise<LayerDefinition[]> => ipcRenderer.invoke('layers:getAll'),
    getById: (id: string): Promise<LayerDefinition | null> =>
      ipcRenderer.invoke('layers:getById', id),
    create: (
      layer: Omit<LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<LayerDefinition> => ipcRenderer.invoke('layers:create', layer),
    update: (id: string, updates: Partial<LayerDefinition>): Promise<LayerDefinition> =>
      ipcRenderer.invoke('layers:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('layers:delete', id),

    // Group operations
    groups: {
      getAll: (): Promise<LayerGroup[]> => ipcRenderer.invoke('layers:groups:getAll'),
      create: (
        group: Omit<LayerGroup, 'id' | 'createdAt' | 'updatedAt' | 'layerIds'>
      ): Promise<LayerGroup> => ipcRenderer.invoke('layers:groups:create', group),
      update: (id: string, updates: Partial<LayerGroup>): Promise<LayerGroup> =>
        ipcRenderer.invoke('layers:groups:update', id, updates),
      delete: (id: string, moveLayersTo?: string): Promise<boolean> =>
        ipcRenderer.invoke('layers:groups:delete', id, moveLayersTo)
    },

    // Search and operations
    search: (criteria: LayerSearchCriteria): Promise<LayerSearchResult> =>
      ipcRenderer.invoke('layers:search', criteria),
    logOperation: (operation: LayerOperation): Promise<void> =>
      ipcRenderer.invoke('layers:logOperation', operation),
    getOperations: (layerId?: string): Promise<LayerOperation[]> =>
      ipcRenderer.invoke('layers:getOperations', layerId),
    logError: (error: LayerError): Promise<void> => ipcRenderer.invoke('layers:logError', error),
    getErrors: (layerId?: string): Promise<LayerError[]> =>
      ipcRenderer.invoke('layers:getErrors', layerId),
    clearErrors: (layerId?: string): Promise<void> =>
      ipcRenderer.invoke('layers:clearErrors', layerId),

    // Style presets
    presets: {
      getAll: (): Promise<StylePreset[]> => ipcRenderer.invoke('layers:presets:getAll'),
      create: (preset: Omit<StylePreset, 'id' | 'createdAt'>): Promise<StylePreset> =>
        ipcRenderer.invoke('layers:presets:create', preset)
    },

    // Performance and bulk operations
    recordMetrics: (metrics: LayerPerformanceMetrics): Promise<void> =>
      ipcRenderer.invoke('layers:recordMetrics', metrics),
    bulkUpdate: (
      updates: Array<{ id: string; changes: Partial<LayerDefinition> }>
    ): Promise<void> => ipcRenderer.invoke('layers:bulkUpdate', updates),
    export: (layerIds: string[]): Promise<string> => ipcRenderer.invoke('layers:export', layerIds),
    import: (data: string, targetGroupId?: string): Promise<string[]> =>
      ipcRenderer.invoke('layers:import', data, targetGroupId),

    // Process GeoTIFF files for display
    processGeotiff: (
      fileBuffer: ArrayBuffer,
      fileName: string
    ): Promise<{ imageUrl: string; bounds?: [number, number, number, number] }> =>
      ipcRenderer.invoke('layers:processGeotiff', fileBuffer, fileName),

    // Generic invoke method for additional operations
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...args)
  } as LayerApi,
  // Agent API for managing agents
  agents: {
    getAll: (): Promise<AgentRegistryEntry[]> =>
      ipcRenderer.invoke(IpcChannels.getAgents).then((res) => (res.success ? res.data : [])),
    getById: (id: string): Promise<AgentDefinition | null> =>
      ipcRenderer
        .invoke(IpcChannels.getAgentById, id)
        .then((res) => (res.success ? res.data : null)),
    create: (agent: CreateAgentParams): Promise<AgentDefinition> =>
      ipcRenderer.invoke(IpcChannels.createAgent, agent).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to create agent')
        return res.data
      }),
    update: (id: string, updates: UpdateAgentParams): Promise<AgentDefinition> =>
      ipcRenderer.invoke(IpcChannels.updateAgent, id, updates).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to update agent')
        return res.data
      }),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.deleteAgent, id).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to delete agent')
        return res.data
      }),
    executeAgent: (): Promise<string> => {
      // This will be implemented when agent execution is supported
      return Promise.resolve('')
    },
    stopExecution: (): Promise<boolean> => {
      // This will be implemented when agent execution is supported
      return Promise.resolve(false)
    },

    // Agent orchestration
    orchestrateMessage: async (
      chatId: string,
      message: string,
      orchestratorAgentId: string
    ): Promise<OrchestrationResult> => {
      try {
        return await ipcRenderer.invoke(IpcChannels.orchestrateMessage, {
          chatId,
          message,
          orchestratorAgentId
        })
      } catch (error) {
        return {
          sessionId: '',
          finalResponse: '',
          subtasks: [],
          subtasksExecuted: 0,
          agentsInvolved: [],
          completionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error in orchestration'
        }
      }
    },

    getCapabilities: async (): Promise<AgentCapabilitiesResult> => {
      try {
        return await ipcRenderer.invoke(IpcChannels.getAgentCapabilities)
      } catch (error) {
        return {
          success: false,
          capabilities: [],
          error: error instanceof Error ? error.message : 'Unknown error getting agent capabilities'
        }
      }
    },

    getOrchestrationStatus: async (sessionId?: string): Promise<OrchestrationStatus> => {
      try {
        return await ipcRenderer.invoke(IpcChannels.getOrchestrationStatus, sessionId)
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error getting orchestration status'
        }
      }
    }
  } as AgentApi,
  // Prompt Module API for managing prompt modules
  promptModules: {
    getAll: (): Promise<PromptModuleInfo[]> =>
      ipcRenderer.invoke(IpcChannels.getPromptModules).then((res) => (res.success ? res.data : [])),
    getById: (id: string): Promise<PromptModule | null> =>
      ipcRenderer
        .invoke(IpcChannels.getPromptModuleById, id)
        .then((res) => (res.success ? res.data : null)),
    create: (promptModule: CreatePromptModuleParams): Promise<PromptModule> =>
      ipcRenderer.invoke(IpcChannels.createPromptModule, promptModule).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to create prompt module')
        return res.data
      }),
    update: (id: string, updates: UpdatePromptModuleParams): Promise<PromptModule> =>
      ipcRenderer.invoke(IpcChannels.updatePromptModule, id, updates).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to update prompt module')
        return res.data
      }),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.deletePromptModule, id).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to delete prompt module')
        return res.data
      }),
    assemble: (request: PromptAssemblyRequest): Promise<PromptAssemblyResult> =>
      ipcRenderer.invoke(IpcChannels.assemblePrompt, request).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to assemble prompt')
        return res.data
      })
  } as PromptModuleApi,
  tools: {
    getAllAvailable: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.toolsGetAllAvailable).then((res) => {
        if (!res.success) throw new Error(res.error || 'Failed to get available tools')
        return res.data
      })
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('ctg:get-app-version')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  process.stderr.write('[Preload Script] Context isolation is ON. STDERR WRITE\n')
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    process.stderr.write(
      '[Preload Script] Attempting to expose ctg API via contextBridge. STDERR WRITE\n'
    )
    contextBridge.exposeInMainWorld('ctg', ctgApi)
    process.stderr.write('[Preload Script] ctg API exposure call completed. STDERR WRITE\n')
  } catch (error) {
    process.stderr.write(`[Preload Script] Error exposing API: ${error}\n`)
  }
} else {
  process.stderr.write(
    '[Preload Script] Context isolation is OFF. APIs will be exposed on global window directly. STDERR WRITE\n'
  )
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.ctg = ctgApi
}
