import type {
  JsonSchemaDefinition,
  PluginDiagnosticEntry,
  PluginHookMode,
  PluginInventoryItem,
  PluginPlatformConfig,
  PluginSource,
  PluginToolInfo
} from '../../../shared/ipc-types'

export const PLUGIN_MANIFEST_FILENAME = 'arion.plugin.json'

export const PLUGIN_HOOK_EVENTS = [
  'before_model_resolve',
  'before_prompt_build',
  'before_agent_start',
  'agent_end',
  'llm_input',
  'llm_output',
  'before_tool_call',
  'after_tool_call',
  'tool_result_persist',
  'session_start',
  'session_end',
  'gateway_start',
  'gateway_stop'
] as const

export type PluginHookEvent = (typeof PLUGIN_HOOK_EVENTS)[number]

export interface ArionPluginManifest {
  id: string
  name: string
  version: string
  description?: string
  main: string
  category?: string
  slots?: string[]
  enabledByDefault?: boolean
  configSchema?: JsonSchemaDefinition
  defaultConfig?: Record<string, unknown>
}

export interface ResolvedPluginManifest extends ArionPluginManifest {
  source: PluginSource
  sourcePath: string
  directoryPath: string
  resolvedMainPath: string
  precedence: number
  rootOrder: number
}

export interface PluginDiscoveryRoot {
  source: PluginSource
  dir: string
  precedence: number
  order: number
}

export interface PluginDiscoveryCandidate {
  source: PluginSource
  manifestPath: string
  rootDir: string
  precedence: number
  rootOrder: number
}

export interface PluginHookContext {
  chatId?: string
  source?: string
  [key: string]: unknown
}

export type PluginHookHandler = (
  payload: unknown,
  context: PluginHookContext
) => Promise<unknown> | unknown

export interface PluginHookRegistration {
  event: PluginHookEvent
  mode: PluginHookMode
  priority?: number
  handler: PluginHookHandler
}

export interface PluginHookRecord extends PluginHookRegistration {
  pluginId: string
  priority: number
}

export interface PluginToolExecutionContext {
  args: unknown
  chatId?: string
  pluginConfig: Record<string, unknown>
}

export type PluginToolExecutor = (context: PluginToolExecutionContext) => Promise<unknown> | unknown

export interface PluginToolRegistration {
  name: string
  description: string
  category?: string
  inputSchema?: JsonSchemaDefinition
  execute: PluginToolExecutor
}

export type ResolvedPluginToolExecutor = (context: {
  args: unknown
  chatId?: string
}) => Promise<unknown> | unknown

export interface ResolvedPluginTool {
  pluginId: string
  name: string
  description: string
  category: string
  inputSchema?: JsonSchemaDefinition
  execute: ResolvedPluginToolExecutor
}

export interface PluginActivationContext {
  manifest: ResolvedPluginManifest
  config: Record<string, unknown>
  registerTool: (tool: PluginToolRegistration) => void
  registerHook: (hook: PluginHookRegistration) => void
  log: (message: string) => void
}

export interface PluginModuleExports {
  activate?: (context: PluginActivationContext) => Promise<unknown> | unknown
  default?: (context: PluginActivationContext) => Promise<unknown> | unknown
  tools?: PluginToolRegistration[]
  hooks?: PluginHookRegistration[]
}

export interface PluginActivationResult {
  tools?: PluginToolRegistration[]
  hooks?: PluginHookRegistration[]
}

export interface PluginLoaderEnvironment {
  getUserDataPath: () => string
  getAppPath: () => string
  getResourcesPath: () => string
  getCwd: () => string
}

export interface PluginPolicyDecision {
  active: boolean
  reason?: string
}

export interface PluginRuntimeState {
  loadedAt: string
  config: PluginPlatformConfig
  inventory: PluginInventoryItem[]
  tools: PluginToolInfo[]
  diagnostics: PluginDiagnosticEntry[]
}
