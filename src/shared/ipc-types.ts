import type { Feature, Geometry } from 'geojson' // Ensure geojson types are imported
import type { OrchestrationResult, Subtask } from '../main/services/types/orchestration-types'
import type {
  AgentDefinition,
  CreateAgentParams,
  UpdateAgentParams,
  AgentCapability
} from './types/agent-types'
export type {
  AgentDefinition,
  AgentRegistryEntry,
  CreateAgentParams,
  UpdateAgentParams,
  AgentCapability
} from './types/agent-types'

// Re-export orchestration types
export type { OrchestrationResult, Subtask } from '../main/services/types/orchestration-types'
import type {
  PromptModule,
  PromptModuleInfo,
  PromptAssemblyRequest,
  PromptAssemblyResult,
  CreatePromptModuleParams,
  UpdatePromptModuleParams
} from './types/prompt-types'
export type {
  PromptModule,
  PromptModuleInfo,
  PromptAssemblyRequest,
  PromptAssemblyResult,
  CreatePromptModuleParams,
  UpdatePromptModuleParams
} from './types/prompt-types'

export type LLMProviderType = 'openai' | 'google' | 'azure' | 'anthropic' | 'vertex' | 'ollama'

export interface OpenAIConfig {
  apiKey: string
  model: string
}

export interface GoogleConfig {
  apiKey: string
  model: string
}

export interface AzureConfig {
  apiKey: string
  endpoint: string
  deploymentName: string
}

export interface AnthropicConfig {
  apiKey: string
  model: string
}

export interface VertexConfig {
  apiKey?: string | null
  project?: string | null
  location?: string | null
  model?: string | null
}

export interface OllamaConfig {
  baseURL?: string | null
  model?: string | null
}

// Added McpServerConfig interface here
export interface McpServerConfig {
  id: string
  name: string
  url?: string // For HTTP/SSE based servers
  command?: string // For stdio based servers (e.g., path to a script)
  args?: string[] // Stored as JSON string in DB by SettingsService
  enabled: boolean
  anthropic?: AnthropicConfig
  vertex?: VertexConfig
  ollama?: OllamaConfig
  activeProvider?: LLMProviderType | null
  // TODO: Consider adding auth details if needed in the future (e.g., apiKey, token)
}

export interface McpToolPreview {
  name: string
  description?: string
}

export interface McpServerTestResult {
  success: boolean
  error?: string
  serverName?: string
  serverVersion?: string
  tools?: McpToolPreview[]
}

export type LLMConfigData =
  | OpenAIConfig
  | GoogleConfig
  | AzureConfig
  | AnthropicConfig
  | VertexConfig
  | OllamaConfig

export interface AllLLMConfigurations {
  openai?: OpenAIConfig
  google?: GoogleConfig
  azure?: AzureConfig
  anthropic?: AnthropicConfig
  vertex?: VertexConfig
  ollama?: OllamaConfig
  activeProvider?: LLMProviderType | null
}

export interface SystemPromptConfig {
  userSystemPrompt: string
}

export const IpcChannels = {
  // Agent System IPC Channels
  getAgents: 'agents:getAll',
  getAgentById: 'agents:getById',
  createAgent: 'agents:create',
  updateAgent: 'agents:update',
  deleteAgent: 'agents:delete',

  // Agent Orchestration IPC Channels
  orchestrateMessage: 'chat:orchestrateMessage',
  getAgentCapabilities: 'agents:getCapabilities',
  getOrchestrationStatus: 'orchestration:getStatus',

  // Prompt Module IPC Channels
  getPromptModules: 'prompts:getAll',
  getPromptModuleById: 'prompts:getById',
  createPromptModule: 'prompts:create',
  updatePromptModule: 'prompts:update',
  deletePromptModule: 'prompts:delete',
  assemblePrompt: 'prompts:assemble',

  // Setters
  setOpenAIConfig: 'settings:set-openai-config',
  setGoogleConfig: 'settings:set-google-config',
  setAzureConfig: 'settings:set-azure-config',
  setAnthropicConfig: 'settings:set-anthropic-config',
  setVertexConfig: 'settings:set-vertex-config',
  setOllamaConfig: 'settings:set-ollama-config',
  setActiveLLMProvider: 'settings:set-active-llm-provider',

  // Getters
  getOpenAIConfig: 'settings:get-openai-config',
  getGoogleConfig: 'settings:get-google-config',
  getAzureConfig: 'settings:get-azure-config',
  getAnthropicConfig: 'settings:get-anthropic-config',
  getVertexConfig: 'settings:get-vertex-config',
  getOllamaConfig: 'settings:get-ollama-config',
  getActiveLLMProvider: 'settings:get-active-llm-provider',
  getAllLLMConfigs: 'settings:get-all-llm-configs', // To load initial state

  // System Prompt IPC Channels
  getSystemPromptConfig: 'settings:get-system-prompt-config',
  setSystemPromptConfig: 'settings:set-system-prompt-config',

  // Database IPC Channels
  dbCreateChat: 'ctg:db:createChat',
  dbGetChatById: 'ctg:db:getChatById',
  dbGetAllChats: 'ctg:db:getAllChats',
  dbUpdateChat: 'ctg:db:updateChat',
  dbDeleteChat: 'ctg:db:deleteChat',
  dbAddMessage: 'ctg:db:addMessage',
  dbGetMessageById: 'ctg:db:getMessageById',
  dbGetMessagesByChatId: 'ctg:db:getMessagesByChatId',
  dbDeleteMessage: 'ctg:db:deleteMessage',

  // MCP Server Configuration IPC Channels
  getMcpServerConfigs: 'settings:get-mcp-server-configs',
  addMcpServerConfig: 'settings:add-mcp-server-config',
  updateMcpServerConfig: 'settings:update-mcp-server-config',
  deleteMcpServerConfig: 'settings:delete-mcp-server-config',
  testMcpServerConfig: 'settings:test-mcp-server-config',

  // Knowledge Base IPC Channels
  kbAddDocument: 'ctg:kb:addDocument',
  kbFindSimilar: 'ctg:kb:findSimilar',
  kbGetChunkCount: 'ctg:kb:getChunkCount',
  kbGetAllDocuments: 'ctg:kb:getAllDocuments',
  kbDeleteDocument: 'ctg:kb:deleteDocument',

  // UI Control IPC Channels
  setMapSidebarVisibility: 'ctg:ui:setMapSidebarVisibility',
  setMapFeatureFilter: 'ctg:map:setFeatureFilter',
  setMapLayerVisibility: 'ctg:map:setLayerVisibility',

  // Shell operations
  shellOpenPath: 'ctg:shell:openPath',

  // MCP Permission System
  mcpRequestPermission: 'ctg:mcp:requestPermission',
  mcpShowPermissionDialog: 'ctg:mcp:showPermissionDialog',
  mcpPermissionResponse: 'ctg:mcp:permissionResponse',

  // PostgreSQL Integration IPC Channels
  postgresqlTestConnection: 'ctg:postgresql:testConnection',
  postgresqlCreateConnection: 'ctg:postgresql:createConnection',
  postgresqlCloseConnection: 'ctg:postgresql:closeConnection',
  postgresqlExecuteQuery: 'ctg:postgresql:executeQuery',
  postgresqlExecuteTransaction: 'ctg:postgresql:executeTransaction',
  postgresqlGetActiveConnections: 'ctg:postgresql:getActiveConnections',
  postgresqlGetConnectionInfo: 'ctg:postgresql:getConnectionInfo',

  // Layer Management IPC Channels
  layersGetAll: 'layers:getAll',
  layersGetById: 'layers:getById',
  layersCreate: 'layers:create',
  layersUpdate: 'layers:update',
  layersDelete: 'layers:delete',
  layersSearch: 'layers:search',
  layersBulkUpdate: 'layers:bulkUpdate',
  layersExport: 'layers:export',
  layersImport: 'layers:import',

  // Layer Group IPC Channels
  layerGroupsGetAll: 'layers:groups:getAll',
  layerGroupsCreate: 'layers:groups:create',
  layerGroupsUpdate: 'layers:groups:update',
  layerGroupsDelete: 'layers:groups:delete',

  // Layer Operations and Errors
  layersLogOperation: 'layers:logOperation',
  layersGetOperations: 'layers:getOperations',
  layersLogError: 'layers:logError',
  layersGetErrors: 'layers:getErrors',
  layersClearErrors: 'layers:clearErrors',

  // Style Presets
  layerPresetsGetAll: 'layers:presets:getAll',
  layerPresetsCreate: 'layers:presets:create',

  // Performance Metrics
  layersRecordMetrics: 'layers:recordMetrics',

  // Tool Management IPC Channels
  toolsGetAllAvailable: 'tools:getAllAvailable'
} as const

// Generic IPC Response wrapper
export interface IPCResponse<T = null> {
  // Default T to null for responses that only carry success/error
  success: boolean
  data?: T
  error?: string
  message?: string // For non-error messages, e.g., success messages with details
}

// MCP Permission System Types
export interface McpPermissionRequest {
  chatId: string
  toolName: string
  serverId: string
  requestId?: string // Added by main process
}

// Type for the API exposed by preload script
export interface SettingsApi {
  setOpenAIConfig: (config: OpenAIConfig) => Promise<void>
  getOpenAIConfig: () => Promise<OpenAIConfig | null>
  setGoogleConfig: (config: GoogleConfig) => Promise<void>
  getGoogleConfig: () => Promise<GoogleConfig | null>
  setAzureConfig: (config: AzureConfig) => Promise<void>
  getAzureConfig: () => Promise<AzureConfig | null>
  setAnthropicConfig: (config: AnthropicConfig) => Promise<void>
  getAnthropicConfig: () => Promise<AnthropicConfig | null>
  setVertexConfig: (config: VertexConfig) => Promise<void>
  getVertexConfig: () => Promise<VertexConfig | null>
  setOllamaConfig: (config: OllamaConfig) => Promise<void>
  getOllamaConfig: () => Promise<OllamaConfig | null>
  setActiveLLMProvider: (provider: LLMProviderType | null) => Promise<void>
  getActiveLLMProvider: () => Promise<LLMProviderType | null>
  getAllLLMConfigs: () => Promise<AllLLMConfigurations>

  // MCP Server Config methods
  getMcpServerConfigs: () => Promise<McpServerConfig[]>
  addMcpServerConfig: (config: Omit<McpServerConfig, 'id'>) => Promise<McpServerConfig | null>
  updateMcpServerConfig: (
    configId: string,
    updates: Partial<Omit<McpServerConfig, 'id'>>
  ) => Promise<McpServerConfig | null>
  deleteMcpServerConfig: (configId: string) => Promise<boolean>
  testMcpServerConfig: (config: Omit<McpServerConfig, 'id'>) => Promise<McpServerTestResult>

  // System Prompt methods
  getSystemPromptConfig: () => Promise<SystemPromptConfig>
  setSystemPromptConfig: (config: SystemPromptConfig) => Promise<void>
}

// Type for the Chat API arguments and return type
export interface ChatRequestBodyForPreload {
  messages: UnsafeAny[] // Using any[] for now, can be refined to @ai-sdk/react Message[] if shared
  // other potential fields from useChat body
}

export interface ChatApi {
  sendMessageStream: (body?: ChatRequestBodyForPreload) => Promise<Uint8Array[]>
  startMessageStream: (body?: ChatRequestBodyForPreload) => Promise<string>
  cancelStream: (streamId: string) => Promise<boolean>
  subscribeToStream: (
    streamId: string,
    callbacks: {
      onChunk: (chunk: Uint8Array) => void
      onError?: (error: Error) => void
      onStart?: () => void
      onEnd?: () => void
    }
  ) => () => void
}

// --- Chat & Message Types for Database ---
export interface Chat {
  id: string
  title?: string | null
  created_at: string // ISO8601 date string
  updated_at: string // ISO8601 date string
  metadata?: string | null // JSON string for additional unstructured data
}

export interface Message {
  id: string
  chat_id: string
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool' | 'data'
  content: string
  name?: string | null
  tool_calls?: string | null
  tool_call_id?: string | null
  created_at: string // ISO8601 date string
  orchestration?: string | null // JSON string containing orchestration data
}

// --- API Interface Definitions for Preload ---

// Type for the Database API exposed by preload script
export interface DbApi {
  createChat: (
    chatData: Pick<Chat, 'id'> & Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
  ) => Promise<{ success: boolean; data?: Chat; error?: string }>
  getChatById: (id: string) => Promise<{ success: boolean; data?: Chat | null; error?: string }>
  getAllChats: (
    orderBy?: 'created_at' | 'updated_at',
    order?: 'ASC' | 'DESC'
  ) => Promise<{ success: boolean; data?: Chat[]; error?: string }>
  updateChat: (
    id: string,
    updates: Partial<Omit<Chat, 'id' | 'created_at' | 'updated_at'>>
  ) => Promise<{ success: boolean; data?: Chat; error?: string }>
  deleteChat: (id: string) => Promise<{ success: boolean; error?: string }>
  addMessage: (
    messageData: Pick<Message, 'id' | 'chat_id' | 'role' | 'content'> &
      Partial<Omit<Message, 'id' | 'chat_id' | 'role' | 'content' | 'created_at'>>
  ) => Promise<{ success: boolean; data?: Message; error?: string }>
  getMessageById: (
    id: string
  ) => Promise<{ success: boolean; data?: Message | null; error?: string }>
  getMessagesByChatId: (
    chat_id: string,
    orderBy?: 'created_at',
    order?: 'ASC' | 'DESC'
  ) => Promise<{ success: boolean; data?: Message[]; error?: string }>
  deleteMessage: (id: string) => Promise<{ success: boolean; error?: string }>

  // Knowledge Base Document specific DB operations
  // dbGetAllKnowledgeBaseDocuments: () => Promise<IPCResponse<KnowledgeBaseDocumentForClient[]>>, // Removed
  // dbDeleteKnowledgeBaseDocument: (documentId: string) => Promise<IPCResponse<null>>, // Removed
}

/**
 * Payload for the 'ctg:map:addFeature' IPC channel.
 * Used to send a GeoJSON feature from the main process to the renderer
 * to be added to the map.
 */
export interface AddMapFeaturePayload {
  feature: Feature<Geometry> // The GeoJSON feature to add
  layerId?: string // Optional: ID of a specific layer to add to, otherwise map default
  fitBounds?: boolean // Optional: Whether the map should zoom to this feature
  sourceId?: string // Optional: a unique ID for the source of this feature to allow updates/removal
}

/**
 * Payload for the 'ctg:map:setPaintProperties' IPC channel.
 */
export interface SetPaintPropertiesPayload {
  sourceId: string // The ID of the source whose layers should be styled
  paintProperties: Record<string, UnsafeAny> // The MapLibre paint properties object
  layerIdPattern?: string // Optional: A pattern to identify specific layers associated with the source (e.g., `${sourceId}-fill-layer`)
  // If not provided, the renderer might try to apply to all layers using this source or a default one.
}

/**
 * Payload for the 'ctg:map:removeSourceAndLayers' IPC channel.
 */
export interface RemoveSourceAndLayersPayload {
  sourceId: string
}

/**
 * Payload for the 'ctg:map:setView' IPC channel.
 * Can use SetMapViewParams from llm-tools directly if shared, or redefine here.
 * For simplicity, let's define it based on the expected structure.
 */
export interface SetMapViewPayload {
  center?: [number, number] // [longitude, latitude]
  zoom?: number
  pitch?: number
  bearing?: number
  animate?: boolean
}

/**
 * Interface describing the map-related API exposed on window.ctg by the preload script.
 */
export interface ExposedMapApi {
  onAddFeature: (callback: (payload: AddMapFeaturePayload) => void) => () => void // Returns a cleanup function
  onSetPaintProperties: (callback: (payload: SetPaintPropertiesPayload) => void) => () => void // + New listener
  onRemoveSourceAndLayers: (callback: (payload: RemoveSourceAndLayersPayload) => void) => () => void // + New listener
  onSetView: (callback: (payload: SetMapViewPayload) => void) => () => void // + New listener
  onAddGeoreferencedImageLayer: (
    callback: (payload: AddGeoreferencedImageLayerPayload) => void
  ) => () => void
}

/**
 * Payload for the 'ctg:ui:setMapSidebarVisibility' IPC channel.
 */
export interface SetMapSidebarVisibilityPayload {
  visible: boolean
}

/**
 * Interface describing the UI control API exposed on window.ctg by the preload script.
 */
export interface ExposedUiApi {
  onSetMapSidebarVisibility: (
    callback: (payload: SetMapSidebarVisibilityPayload) => void
  ) => () => void
}

// --- Knowledge Base Types for API ---
// Matches KBRecord in knowledge-base.service.ts but might not need embedding directly in frontend for findSimilar results
export interface KBRecordForClient {
  id: string
  document_id: string
  content: string
  created_at: string
}

// Type for the payload of kbAddDocument
export interface KBAddDocumentPayload {
  documentId: string
  fileType: string
  originalName: string // This comes from formData.name in the UI
  filePath?: string // For file system access
  fileBuffer?: ArrayBuffer // For drag-drop or when path is unavailable
  fileSize?: number // Add fileSize
  folderId?: string // Add folderId (optional)
  description?: string // Add description (optional)
}

export interface KBAddDocumentResult {
  success: boolean
  documentId?: string
  error?: string
  document?: KnowledgeBaseDocumentForClient // Or the full KnowledgeBaseDocument from db.service if sharable
}

export interface KnowledgeBaseApi {
  addDocument: (payload: KBAddDocumentPayload) => Promise<KBAddDocumentResult>
  findSimilar: (
    query: string,
    limit?: number
  ) => Promise<{ success: boolean; data?: KBRecordForClient[]; error?: string }>
  getChunkCount: () => Promise<{ success: boolean; data?: number; error?: string }>
  getAllDocuments: () => Promise<IPCResponse<KnowledgeBaseDocumentForClient[]>>
  deleteDocument: (documentId: string) => Promise<IPCResponse<null>>
}

// --- Shell API for opening paths or URLs --- (New)
export interface ExposedShellApi {
  openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
}

// --- MCP Permission API ---
export interface McpPermissionApi {
  requestPermission: (request: McpPermissionRequest) => Promise<boolean>
  showPermissionDialog: (request: McpPermissionRequest) => Promise<boolean>
  permissionResponse: (requestId: string, granted: boolean) => Promise<void>
  onShowPermissionDialog: (callback: (payload: McpPermissionRequest) => void) => () => void
}

// This will be used in preload to type contextBridge
declare global {
  interface Window {
    ctg: {
      orchestration?: {
        getStatus: (sessionId?: string) => Promise<OrchestrationStatus>
        orchestrateMessage: (
          chatId: string,
          message: string,
          orchestratorAgentId: string
        ) => Promise<OrchestrationResult>
      }
      settings: SettingsApi
      chat: ChatApi
      db: DbApi
      map: ExposedMapApi
      ui?: ExposedUiApi
      knowledgeBase: KnowledgeBaseApi
      shell: ExposedShellApi // Added shell API
      mcp: McpPermissionApi // Added MCP permission API
      postgresql: PostgreSQLApi // Added PostgreSQL API
      layers: LayerApi // Added Layer Management API
      agents: AgentApi // Added Agent System API
      promptModules: PromptModuleApi // Added Prompt Module API
      tools: ToolsApi // Added Tools API
      getAppVersion: () => Promise<string>
    }
  }
}

export interface AgentCapabilitiesResult {
  success: boolean
  capabilities: (Omit<AgentCapability, 'tools' | 'exampleTasks'> & { agents?: string[] })[]
  error?: string
}

export interface OrchestrationStatus {
  success: boolean
  activeSessions?: string[]
  subtasks?: Record<string, Subtask[]>
  error?: string
}

// Import needed for the interface
import type { AgentRegistryEntry } from './types/agent-types'

// Agent System API for preload script
export interface AgentApi {
  // Agent CRUD operations
  getAll: () => Promise<AgentRegistryEntry[]>
  getById: (id: string) => Promise<AgentDefinition | null>
  create: (agent: CreateAgentParams) => Promise<AgentDefinition>
  update: (id: string, updates: UpdateAgentParams) => Promise<AgentDefinition>
  delete: (id: string) => Promise<boolean>

  // Agent execution
  executeAgent: (agentId: string, chatId: string) => Promise<string> // Returns execution ID
  stopExecution: (executionId: string) => Promise<boolean>

  // Orchestration
  orchestrateMessage: (
    chatId: string,
    message: string,
    orchestratorAgentId: string
  ) => Promise<OrchestrationResult>
  getCapabilities: () => Promise<AgentCapabilitiesResult>
  getOrchestrationStatus: (sessionId?: string) => Promise<OrchestrationStatus>
}

// Prompt Module API for preload script
export interface PromptModuleApi {
  // Prompt module CRUD operations
  getAll: () => Promise<PromptModuleInfo[]>
  getById: (id: string) => Promise<PromptModule | null>
  create: (promptModule: CreatePromptModuleParams) => Promise<PromptModule>
  update: (id: string, updates: UpdatePromptModuleParams) => Promise<PromptModule>
  delete: (id: string) => Promise<boolean>

  // Prompt assembly
  assemble: (request: PromptAssemblyRequest) => Promise<PromptAssemblyResult>
}

// Define KnowledgeBaseDocument for client-side usage if different from DBService one,
// or re-export/reuse if identical and sharable.
// For now, assume it might have client-specific fields or be a subset.
export type KnowledgeBaseDocumentForClient = {
  id: string
  name: string
  original_file_name: string
  filePath?: string | null
  file_type: string
  file_size: number
  folder_id?: string
  description?: string
  chunk_count?: number
  created_at: string // Should be string for IPC transfer if Date object
  updated_at: string // Should be string for IPC transfer if Date object
}

// Define types for other new IPC calls
export type GetAllKnowledgeBaseDocumentsResult = KnowledgeBaseDocumentForClient[]

// --- Add Georeferenced Image Layer Payload ---
export interface AddGeoreferencedImageLayerPayload {
  imageUrl: string
  coordinates: number[][]
  sourceId?: string
  layerId?: string
  fitBounds?: boolean
  opacity?: number
}

// --- PostgreSQL Integration Types ---
export interface PostgreSQLConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
}

export interface PostgreSQLConnectionResult {
  success: boolean
  version?: string
  postgisVersion?: string | null
  message: string
}

export interface PostgreSQLFieldInfo {
  name: string
  dataTypeID: number
  dataTypeSize: number
  dataTypeModifier: number
  format: string
}

export interface PostgreSQLQueryResult {
  success: boolean
  rows?: UnsafeAny[]
  rowCount?: number
  fields?: PostgreSQLFieldInfo[]
  executionTime?: number
  message: string
}

export interface PostgreSQLConnectionInfo {
  connected: boolean
  config?: PostgreSQLConfig
}

// Layer Management API for preload script
export interface LayerApi {
  // Layer CRUD operations
  getAll: () => Promise<import('./types/layer-types').LayerDefinition[]>
  getById: (id: string) => Promise<import('./types/layer-types').LayerDefinition | null>
  create: (
    layer: Omit<import('./types/layer-types').LayerDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<import('./types/layer-types').LayerDefinition>
  update: (
    id: string,
    updates: Partial<import('./types/layer-types').LayerDefinition>
  ) => Promise<import('./types/layer-types').LayerDefinition>
  delete: (id: string) => Promise<boolean>
  search: (
    criteria: import('./types/layer-types').LayerSearchCriteria
  ) => Promise<import('./types/layer-types').LayerSearchResult>
  bulkUpdate: (
    updates: Array<{ id: string; changes: Partial<import('./types/layer-types').LayerDefinition> }>
  ) => Promise<void>
  export: (layerIds: string[]) => Promise<string>
  import: (data: string, targetGroupId?: string) => Promise<string[]>

  // Group operations
  groups: {
    getAll: () => Promise<import('./types/layer-types').LayerGroup[]>
    create: (
      group: Omit<
        import('./types/layer-types').LayerGroup,
        'id' | 'createdAt' | 'updatedAt' | 'layerIds'
      >
    ) => Promise<import('./types/layer-types').LayerGroup>
    update: (
      id: string,
      updates: Partial<import('./types/layer-types').LayerGroup>
    ) => Promise<import('./types/layer-types').LayerGroup>
    delete: (id: string, moveLayersTo?: string) => Promise<boolean>
  }

  // Operations and errors
  logOperation: (operation: import('./types/layer-types').LayerOperation) => Promise<void>
  getOperations: (layerId?: string) => Promise<import('./types/layer-types').LayerOperation[]>
  logError: (error: import('./types/layer-types').LayerError) => Promise<void>
  getErrors: (layerId?: string) => Promise<import('./types/layer-types').LayerError[]>
  clearErrors: (layerId?: string) => Promise<void>

  // Style presets
  presets: {
    getAll: () => Promise<import('./types/layer-types').StylePreset[]>
    create: (
      preset: Omit<import('./types/layer-types').StylePreset, 'id' | 'createdAt'>
    ) => Promise<import('./types/layer-types').StylePreset>
  }

  // Performance metrics
  recordMetrics: (metrics: import('./types/layer-types').LayerPerformanceMetrics) => Promise<void>

  // GeoTIFF processing
  processGeotiff: (
    fileBuffer: ArrayBuffer,
    fileName: string
  ) => Promise<{ imageUrl: string; bounds?: [number, number, number, number] }>
}

// PostgreSQL API for preload script
export interface PostgreSQLApi {
  testConnection: (config: PostgreSQLConfig) => Promise<PostgreSQLConnectionResult>
  createConnection: (id: string, config: PostgreSQLConfig) => Promise<PostgreSQLConnectionResult>
  closeConnection: (id: string) => Promise<void>
  executeQuery: (id: string, query: string, params?: UnsafeAny[]) => Promise<PostgreSQLQueryResult>
  executeTransaction: (id: string, queries: string[]) => Promise<PostgreSQLQueryResult>
  getActiveConnections: () => Promise<string[]>
  getConnectionInfo: (id: string) => Promise<PostgreSQLConnectionInfo>
}

// Tools API for preload script
export interface ToolsApi {
  getAllAvailable: () => Promise<string[]>
}
