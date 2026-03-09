export type CodexReasoningEffort = 'low' | 'medium' | 'high'
export type CodexDefaultMode = 'workspace-approval'

export interface CodexConfig {
  binaryPath: string | null
  homePath: string | null
  defaultModel: string
  reasoningEffort: CodexReasoningEffort
  defaultMode: CodexDefaultMode
}

export type CodexInstallState = 'installed' | 'missing' | 'unsupported-version' | 'error'
export type CodexAuthState = 'authenticated' | 'unauthenticated' | 'unknown'

export interface CodexInstallStatus {
  state: CodexInstallState
  version: string | null
  minimumSupportedVersion: string
  message: string
}

export interface CodexHealthStatus {
  checkedAt: string
  install: CodexInstallStatus
  authState: CodexAuthState
  authMessage: string
  isReady: boolean
}

export type CodexRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CodexArtifactType =
  | 'markdown'
  | 'text'
  | 'python'
  | 'geojson'
  | 'csv'
  | 'image'
  | 'sql'
  | 'json'
  | 'unknown'

export type CodexArtifactImportKind = 'map-layer' | 'table' | 'attachment' | 'script' | 'none'

export interface CodexRunArtifact {
  id: string
  name: string
  path: string
  relativePath: string
  type: CodexArtifactType
  sizeBytes: number
  importKind: CodexArtifactImportKind
  mimeType: string | null
}

export interface CodexStagedInput {
  id: string
  label: string
  kind: 'prompt' | 'file' | 'layer' | 'metadata'
  sourcePath: string | null
  stagedPath: string
  status: 'staged' | 'skipped'
  note?: string
}

export interface CodexRunRequest {
  chatId: string
  goal: string
  filePaths?: string[]
  layerIds?: string[]
  expectedOutputs?: string[]
  importPreference?: 'none' | 'suggest'
  model?: string | null
  reasoningEffort?: CodexReasoningEffort
}

export interface CodexRunRecord {
  runId: string
  chatId: string
  status: CodexRunStatus
  goal: string
  model: string
  reasoningEffort: CodexReasoningEffort
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
  artifacts: CodexRunArtifact[]
}

export interface CodexRunResult extends CodexRunRecord {
  stagedInputs: CodexStagedInput[]
}

export type CodexRuntimeEventType =
  | 'status'
  | 'message-delta'
  | 'message'
  | 'command-started'
  | 'command-completed'
  | 'turn-completed'
  | 'artifact-scan-completed'
  | 'error'

export interface CodexRuntimeEvent {
  eventId: string
  runId: string
  chatId: string
  type: CodexRuntimeEventType
  createdAt: string
  status?: CodexRunStatus
  phase?: 'commentary' | 'final_answer' | 'unknown'
  text?: string
  message?: string
  itemId?: string
  turnId?: string
  command?: string
  cwd?: string | null
  exitCode?: number | null
}

export type CodexApprovalKind =
  | 'command'
  | 'file-change'
  | 'file-read'
  | 'tool-user-input'
  | 'unknown'

export interface CodexApprovalRequest {
  approvalId: string
  runId: string
  chatId: string
  kind: CodexApprovalKind
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

export type CodexApprovalScope = 'once' | 'run'

export interface CodexApprovalDecision {
  approvalId: string
  scope: CodexApprovalScope
}
