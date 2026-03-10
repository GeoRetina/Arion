export type ExternalRuntimeProviderHint =
  | 'openai'
  | 'google'
  | 'azure'
  | 'anthropic'
  | 'vertex'
  | 'ollama'

export type ExternalRuntimeConfigValue = string | boolean | null

export interface ExternalRuntimeConfig {
  [key: string]: ExternalRuntimeConfigValue
}

export interface ExternalRuntimeConfigFieldOption {
  value: string
  label: string
}

export type ExternalRuntimeConfigFieldType = 'text' | 'path' | 'select'

export interface ExternalRuntimeConfigField {
  key: string
  label: string
  type: ExternalRuntimeConfigFieldType
  placeholder?: string
  description?: string
  required?: boolean
  readOnly?: boolean
  showInSummary?: boolean
  options?: ExternalRuntimeConfigFieldOption[]
}

export interface ExternalRuntimeDescriptor {
  id: string
  name: string
  description: string
  runtimeKind: 'coding-runtime'
  providerHint: ExternalRuntimeProviderHint
  defaultConfig: ExternalRuntimeConfig
  configFields: ExternalRuntimeConfigField[]
  loginCommand?: string | null
  setupNotes?: string[]
}

export type ExternalRuntimeReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'
export type ExternalRuntimeDefaultMode = 'workspace-approval'

export type ExternalRuntimeInstallState = 'installed' | 'missing' | 'unsupported-version' | 'error'

export type ExternalRuntimeAuthState = 'authenticated' | 'unauthenticated' | 'unknown'

export interface ExternalRuntimeInstallStatus {
  state: ExternalRuntimeInstallState
  version: string | null
  minimumSupportedVersion: string
  message: string
}

export interface ExternalRuntimeHealthStatus {
  runtimeId: string
  runtimeName: string
  checkedAt: string
  install: ExternalRuntimeInstallStatus
  authState: ExternalRuntimeAuthState
  authMessage: string
  isReady: boolean
}

export type ExternalRuntimeRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ExternalRuntimeArtifactType =
  | 'markdown'
  | 'text'
  | 'python'
  | 'geojson'
  | 'csv'
  | 'image'
  | 'sql'
  | 'json'
  | 'unknown'

export type ExternalRuntimeArtifactImportKind =
  | 'map-layer'
  | 'table'
  | 'attachment'
  | 'script'
  | 'none'

export interface ExternalRuntimeRunArtifact {
  id: string
  name: string
  path: string
  relativePath: string
  type: ExternalRuntimeArtifactType
  sizeBytes: number
  importKind: ExternalRuntimeArtifactImportKind
  mimeType: string | null
}

export interface ExternalRuntimeStagedInput {
  id: string
  label: string
  kind: 'prompt' | 'file' | 'layer' | 'metadata'
  sourcePath: string | null
  stagedPath: string
  status: 'staged' | 'skipped'
  note?: string
}

export interface ExternalRuntimeRunRequest {
  runtimeId: string
  chatId: string
  goal: string
  filePaths?: string[]
  layerIds?: string[]
  expectedOutputs?: string[]
  importPreference?: 'none' | 'suggest'
  model?: string | null
  reasoningEffort?: ExternalRuntimeReasoningEffort
}

export interface ExternalRuntimeRunRecord {
  runtimeId: string
  runtimeName: string
  runId: string
  chatId: string
  status: ExternalRuntimeRunStatus
  goal: string
  model: string
  reasoningEffort: ExternalRuntimeReasoningEffort
  workspacePath: string
  inputsPath: string
  outputsPath: string
  logsPath: string
  manifestPath: string
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  summary?: string | null
  error?: string | null
  artifacts: ExternalRuntimeRunArtifact[]
}

export interface ExternalRuntimeRunResult extends ExternalRuntimeRunRecord {
  stagedInputs: ExternalRuntimeStagedInput[]
}

export type ExternalRuntimeEventType =
  | 'status'
  | 'message-delta'
  | 'message'
  | 'command-started'
  | 'command-completed'
  | 'turn-completed'
  | 'artifact-scan-completed'
  | 'error'

export interface ExternalRuntimeEvent {
  runtimeId: string
  runtimeName: string
  eventId: string
  runId: string
  chatId: string
  type: ExternalRuntimeEventType
  createdAt: string
  status?: ExternalRuntimeRunStatus
  phase?: 'commentary' | 'final_answer' | 'unknown'
  text?: string
  message?: string
  itemId?: string
  turnId?: string
  command?: string
  cwd?: string | null
  exitCode?: number | null
}

export type ExternalRuntimeApprovalKind =
  | 'command'
  | 'file-change'
  | 'file-read'
  | 'tool-user-input'
  | 'unknown'

export interface ExternalRuntimeApprovalRequest {
  runtimeId: string
  runtimeName: string
  approvalId: string
  runId: string
  chatId: string
  kind: ExternalRuntimeApprovalKind
  createdAt: string
  requestId: string
  turnId?: string
  itemId?: string
  command?: string | null
  cwd?: string | null
  reason?: string | null
  grantRoot?: string | null
  commandActions?: Array<{
    type: string
    command: string
    path?: string | null
    name?: string | null
    query?: string | null
  }>
}

export type ExternalRuntimeApprovalScope = 'once' | 'run'

export interface ExternalRuntimeApprovalDecision {
  runtimeId: string
  approvalId: string
  scope: ExternalRuntimeApprovalScope
}
