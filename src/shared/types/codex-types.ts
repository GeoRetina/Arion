import type {
  ExternalRuntimeApprovalDecision,
  ExternalRuntimeApprovalKind,
  ExternalRuntimeApprovalRequest,
  ExternalRuntimeApprovalScope,
  ExternalRuntimeArtifactImportKind,
  ExternalRuntimeArtifactType,
  ExternalRuntimeAuthState,
  ExternalRuntimeDefaultMode,
  ExternalRuntimeHealthStatus,
  ExternalRuntimeInstallState,
  ExternalRuntimeReasoningEffort,
  ExternalRuntimeRunArtifact,
  ExternalRuntimeRunRecord,
  ExternalRuntimeRunRequest,
  ExternalRuntimeRunResult,
  ExternalRuntimeRunStatus,
  ExternalRuntimeEvent,
  ExternalRuntimeStagedInput
} from './external-runtime-types'

export type CodexReasoningEffort = ExternalRuntimeReasoningEffort
export type CodexDefaultMode = ExternalRuntimeDefaultMode

export interface CodexConfig {
  binaryPath: string | null
  homePath: string | null
  defaultModel: string
  reasoningEffort: CodexReasoningEffort
  defaultMode: CodexDefaultMode
}

export type CodexInstallState = ExternalRuntimeInstallState
export type CodexAuthState = ExternalRuntimeAuthState
export type CodexRunStatus = ExternalRuntimeRunStatus
export type CodexArtifactType = ExternalRuntimeArtifactType
export type CodexArtifactImportKind = ExternalRuntimeArtifactImportKind
export type CodexApprovalKind = ExternalRuntimeApprovalKind
export type CodexApprovalScope = ExternalRuntimeApprovalScope

export interface CodexHealthStatus extends Omit<
  ExternalRuntimeHealthStatus,
  'runtimeId' | 'runtimeName'
> {}

export interface CodexRunArtifact extends ExternalRuntimeRunArtifact {}

export interface CodexStagedInput extends ExternalRuntimeStagedInput {}

export interface CodexRunRequest extends Omit<ExternalRuntimeRunRequest, 'runtimeId'> {}

export interface CodexRunRecord extends Omit<
  ExternalRuntimeRunRecord,
  'runtimeId' | 'runtimeName'
> {}

export interface CodexRunResult extends Omit<
  ExternalRuntimeRunResult,
  'runtimeId' | 'runtimeName'
> {}

export interface CodexRuntimeEvent extends Omit<
  ExternalRuntimeEvent,
  'runtimeId' | 'runtimeName'
> {}

export interface CodexApprovalRequest extends Omit<
  ExternalRuntimeApprovalRequest,
  'runtimeId' | 'runtimeName'
> {}

export interface CodexApprovalDecision extends Omit<ExternalRuntimeApprovalDecision, 'runtimeId'> {}
