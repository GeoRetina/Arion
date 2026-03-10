import type {
  ExternalRuntimeApprovalDecision,
  ExternalRuntimeApprovalRequest,
  ExternalRuntimeConfig,
  ExternalRuntimeDescriptor,
  ExternalRuntimeEvent,
  ExternalRuntimeHealthStatus,
  ExternalRuntimeRunRecord,
  ExternalRuntimeRunRequest,
  ExternalRuntimeRunResult
} from '../../../shared/ipc-types'

export interface ExternalRuntimeAdapter {
  readonly descriptor: ExternalRuntimeDescriptor
  getConfig(): Promise<ExternalRuntimeConfig>
  saveConfig(config: ExternalRuntimeConfig): Promise<void>
  getHealth(configOverride?: ExternalRuntimeConfig): Promise<ExternalRuntimeHealthStatus>
  startRun(request: ExternalRuntimeRunRequest): Promise<ExternalRuntimeRunResult>
  cancelRun(runId: string): Promise<boolean>
  getRun(runId: string): Promise<ExternalRuntimeRunResult | null>
  listRuns(chatId?: string): Promise<ExternalRuntimeRunRecord[]>
  approveRequest(decision: ExternalRuntimeApprovalDecision): Promise<void>
  denyRequest(approvalId: string): Promise<void>
  on(event: 'run-event', listener: (event: ExternalRuntimeEvent) => void): this
  on(event: 'approval-request', listener: (request: ExternalRuntimeApprovalRequest) => void): this
  on(event: 'health-updated', listener: (status: ExternalRuntimeHealthStatus) => void): this
}
