import type {
  ConnectorBackend,
  ConnectorCapability,
  ConnectorRunOutcome,
  IntegrationId
} from '../../../../shared/ipc-types'

export interface ConnectorRunLogInput {
  runId: string
  startedAt: string
  finishedAt: string
  durationMs: number
  chatId?: string
  agentId?: string
  integrationId: IntegrationId
  capability: ConnectorCapability
  backend?: ConnectorBackend
  outcome: ConnectorRunOutcome
  message: string
  errorCode?: string
}
