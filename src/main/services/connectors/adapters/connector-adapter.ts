import type {
  ConnectorBackend,
  ConnectorCapability,
  IntegrationId
} from '../../../../shared/ipc-types'

export type ConnectorExecutionErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_CAPABILITY'
  | 'POLICY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'TIMEOUT'
  | 'VALIDATION_FAILED'
  | 'MCP_TOOL_UNAVAILABLE'
  | 'MCP_SERVER_UNAVAILABLE'
  | 'EXECUTION_FAILED'

export interface ConnectorExecutionError {
  code: ConnectorExecutionErrorCode
  message: string
  details?: Record<string, unknown>
  retryable?: boolean
}

export interface ConnectorExecutionRequest {
  integrationId: IntegrationId
  capability: ConnectorCapability
  input: Record<string, unknown>
  chatId?: string
  agentId?: string
  timeoutMs?: number
  maxRetries?: number
  preferredBackends?: ConnectorBackend[]
}

export interface ConnectorExecutionContext {
  timeoutMs: number
  attempt: number
  maxRetries: number
}

export interface ConnectorAdapterSuccess {
  success: true
  data: unknown
  details?: Record<string, unknown>
}

export interface ConnectorAdapterFailure {
  success: false
  error: ConnectorExecutionError
}

export type ConnectorAdapterResult = ConnectorAdapterSuccess | ConnectorAdapterFailure

export interface ConnectorAdapter {
  readonly id: string
  readonly backend: ConnectorBackend
  supports(integrationId: IntegrationId, capability: ConnectorCapability): boolean
  execute(
    request: ConnectorExecutionRequest,
    context: ConnectorExecutionContext
  ): Promise<ConnectorAdapterResult>
  shutdown?(): Promise<void>
}

export const buildConnectorError = (
  code: ConnectorExecutionErrorCode,
  message: string,
  details?: Record<string, unknown>,
  retryable = false
): ConnectorAdapterFailure => ({
  success: false,
  error: {
    code,
    message,
    details,
    retryable
  }
})
