import type {
  ConnectorApprovalMode,
  ConnectorBackend,
  ConnectorCapability,
  ConnectorCapabilityRegistration,
  ConnectorRunRecord,
  IntegrationId
} from '../../../shared/ipc-types'
import type { ConnectorAdapterResult, ConnectorExecutionError } from './adapters/connector-adapter'
import type { ConnectorExecutionRequest } from './adapters/connector-adapter'
import { ConnectorCapabilityRegistry } from './connector-capability-registry'
import type { ConnectorPolicyService } from './policy/connector-policy-service'
import type { ConnectorRunLogger } from './telemetry/connector-run-logger'

const ALL_BACKENDS: ConnectorBackend[] = ['native', 'mcp', 'plugin']
const TIMEOUT_ERROR = Symbol('CONNECTOR_EXECUTION_TIMEOUT')
const DEFAULT_CAPABILITY_BY_INTEGRATION: Record<IntegrationId, ConnectorCapability> = {
  stac: 'catalog.search',
  cog: 'raster.inspectMetadata',
  pmtiles: 'tiles.inspectArchive',
  wms: 'tiles.getCapabilities',
  wmts: 'tiles.getCapabilities',
  s3: 'storage.list',
  'google-earth-engine': 'gee.listAlgorithms',
  'postgresql-postgis': 'sql.query'
}

interface ConnectorTimeoutError extends Error {
  [TIMEOUT_ERROR]: true
}

export interface ConnectorExecutionSuccess {
  success: true
  runId: string
  integrationId: IntegrationId
  capability: ConnectorCapability
  backend: ConnectorBackend
  durationMs: number
  data: unknown
  details?: Record<string, unknown>
}

export interface ConnectorExecutionFailure {
  success: false
  runId: string
  integrationId: IntegrationId
  capability: ConnectorCapability
  backend?: ConnectorBackend
  durationMs: number
  error: ConnectorExecutionError
  attempts: Array<{
    backend: ConnectorBackend
    errorCode: string
    message: string
    attempt: number
  }>
}

export type ConnectorExecutionResult = ConnectorExecutionSuccess | ConnectorExecutionFailure

const nowIso = (): string => new Date().toISOString()
const createRunId = (): string =>
  `connector_${Date.now()}_${Math.random().toString(36).slice(2, 10).toLowerCase()}`

export class ConnectorExecutionService {
  constructor(
    private readonly registry: ConnectorCapabilityRegistry,
    private readonly policyService: ConnectorPolicyService,
    private readonly runLogger: ConnectorRunLogger
  ) {}

  public getCapabilities(): ConnectorCapabilityRegistration[] {
    return this.registry.listCapabilities()
  }

  public getRunLogs(limit = 50): ConnectorRunRecord[] {
    return this.runLogger.list(limit)
  }

  public clearRunLogs(): void {
    this.runLogger.clear()
  }

  public logIntegrationLifecycleEvent(input: {
    integrationId: IntegrationId
    event: 'testConnection' | 'connect' | 'disconnect'
    success: boolean
    message: string
    durationMs: number
  }): void {
    const finishedMs = Date.now()
    const safeDurationMs = Math.max(0, input.durationMs)
    const startedAt = new Date(finishedMs - safeDurationMs).toISOString()
    const finishedAt = new Date(finishedMs).toISOString()

    this.runLogger.log({
      runId: createRunId(),
      startedAt,
      finishedAt,
      durationMs: safeDurationMs,
      integrationId: input.integrationId,
      capability: DEFAULT_CAPABILITY_BY_INTEGRATION[input.integrationId],
      outcome: input.success ? 'success' : 'error',
      message: `integration.${input.event}: ${input.message}`,
      errorCode: input.success ? undefined : 'EXECUTION_FAILED'
    })
  }

  public grantApproval(
    mode: ConnectorApprovalMode,
    integrationId: IntegrationId,
    capability: ConnectorCapability,
    chatId?: string
  ): void {
    if (mode === 'session') {
      if (!chatId) {
        return
      }
      this.policyService.grantSessionApproval(chatId, integrationId, capability)
      return
    }
    if (mode === 'once') {
      this.policyService.grantOneTimeApproval(chatId, integrationId, capability)
    }
  }

  public clearApprovals(chatId?: string): void {
    this.policyService.clearSessionApprovals(chatId)
  }

  public async execute(request: ConnectorExecutionRequest): Promise<ConnectorExecutionResult> {
    const runId = createRunId()
    const startedAt = nowIso()
    const startedMs = Date.now()

    const policyDecision = await this.policyService.evaluate({
      integrationId: request.integrationId,
      capability: request.capability,
      chatId: request.chatId
    })

    if (!policyDecision.allowed) {
      const deniedErrorCode =
        policyDecision.reason?.toLowerCase().includes('approval required') === true
          ? 'APPROVAL_REQUIRED'
          : 'POLICY_DENIED'
      const durationMs = Date.now() - startedMs
      this.runLogger.log({
        runId,
        startedAt,
        finishedAt: nowIso(),
        durationMs,
        chatId: request.chatId,
        agentId: request.agentId,
        integrationId: request.integrationId,
        capability: request.capability,
        outcome: 'policy_denied',
        message: policyDecision.reason || 'Policy denied connector execution',
        errorCode: deniedErrorCode
      })

      return {
        success: false,
        runId,
        integrationId: request.integrationId,
        capability: request.capability,
        durationMs,
        error: {
          code: deniedErrorCode,
          message: policyDecision.reason || 'Connector execution denied by policy'
        },
        attempts: []
      }
    }

    const deniedBackends = ALL_BACKENDS.filter(
      (backend) => !policyDecision.allowedBackends.includes(backend)
    )

    const preferredBackends =
      request.preferredBackends && request.preferredBackends.length > 0
        ? request.preferredBackends.filter((backend) =>
            policyDecision.allowedBackends.includes(backend)
          )
        : policyDecision.allowedBackends

    const candidateRoutes = this.registry.resolve(
      request.integrationId,
      request.capability,
      preferredBackends,
      deniedBackends
    )

    if (candidateRoutes.length === 0) {
      const durationMs = Date.now() - startedMs
      this.runLogger.log({
        runId,
        startedAt,
        finishedAt: nowIso(),
        durationMs,
        chatId: request.chatId,
        agentId: request.agentId,
        integrationId: request.integrationId,
        capability: request.capability,
        outcome: 'error',
        message: `No adapter registered for ${request.integrationId}/${request.capability}`,
        errorCode: 'UNSUPPORTED_CAPABILITY'
      })

      return {
        success: false,
        runId,
        integrationId: request.integrationId,
        capability: request.capability,
        durationMs,
        error: {
          code: 'UNSUPPORTED_CAPABILITY',
          message: `No adapter registered for ${request.integrationId}/${request.capability}`
        },
        attempts: []
      }
    }

    const timeoutMs =
      typeof request.timeoutMs === 'number' && request.timeoutMs > 0
        ? request.timeoutMs
        : policyDecision.timeoutMs
    const maxRetries =
      typeof request.maxRetries === 'number' && request.maxRetries >= 0
        ? Math.floor(request.maxRetries)
        : policyDecision.maxRetries

    const attempts: ConnectorExecutionFailure['attempts'] = []
    let lastFailure: ConnectorExecutionFailure | null = null

    for (const route of candidateRoutes) {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const adapterResult = await this.runWithTimeout(
            route.adapter.execute(request, {
              timeoutMs,
              attempt,
              maxRetries
            }),
            timeoutMs
          )

          if (adapterResult.success) {
            const durationMs = Date.now() - startedMs
            this.runLogger.log({
              runId,
              startedAt,
              finishedAt: nowIso(),
              durationMs,
              chatId: request.chatId,
              agentId: request.agentId,
              integrationId: request.integrationId,
              capability: request.capability,
              backend: route.adapter.backend,
              outcome: 'success',
              message: `${request.integrationId}/${request.capability} succeeded via ${route.adapter.backend}`
            })

            return {
              success: true,
              runId,
              integrationId: request.integrationId,
              capability: request.capability,
              backend: route.adapter.backend,
              durationMs,
              data: adapterResult.data,
              details: adapterResult.details
            }
          }

          attempts.push({
            backend: route.adapter.backend,
            errorCode: adapterResult.error.code,
            message: adapterResult.error.message,
            attempt
          })
          lastFailure = this.buildFailureFromAdapterError(
            runId,
            request.integrationId,
            request.capability,
            Date.now() - startedMs,
            route.adapter.backend,
            adapterResult,
            attempts
          )

          if (!adapterResult.error.retryable) {
            break
          }
        } catch (error) {
          const timeoutError = this.asTimeoutError(error)
          if (timeoutError) {
            attempts.push({
              backend: route.adapter.backend,
              errorCode: 'TIMEOUT',
              message: timeoutError.message,
              attempt
            })
            lastFailure = {
              success: false,
              runId,
              integrationId: request.integrationId,
              capability: request.capability,
              backend: route.adapter.backend,
              durationMs: Date.now() - startedMs,
              error: {
                code: 'TIMEOUT',
                message: timeoutError.message,
                retryable: true
              },
              attempts: [...attempts]
            }
          } else {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown connector execution error'
            attempts.push({
              backend: route.adapter.backend,
              errorCode: 'EXECUTION_FAILED',
              message: errorMessage,
              attempt
            })
            lastFailure = {
              success: false,
              runId,
              integrationId: request.integrationId,
              capability: request.capability,
              backend: route.adapter.backend,
              durationMs: Date.now() - startedMs,
              error: {
                code: 'EXECUTION_FAILED',
                message: errorMessage,
                retryable: true
              },
              attempts: [...attempts]
            }
          }
        }
      }
    }

    const fallbackFailure: ConnectorExecutionFailure =
      lastFailure ||
      ({
        success: false,
        runId,
        integrationId: request.integrationId,
        capability: request.capability,
        durationMs: Date.now() - startedMs,
        error: {
          code: 'EXECUTION_FAILED',
          message: `Execution failed for ${request.integrationId}/${request.capability}`
        },
        attempts
      } satisfies ConnectorExecutionFailure)

    this.runLogger.log({
      runId,
      startedAt,
      finishedAt: nowIso(),
      durationMs: fallbackFailure.durationMs,
      chatId: request.chatId,
      agentId: request.agentId,
      integrationId: request.integrationId,
      capability: request.capability,
      backend: fallbackFailure.backend,
      outcome: fallbackFailure.error.code === 'TIMEOUT' ? 'timeout' : 'error',
      message: fallbackFailure.error.message,
      errorCode: fallbackFailure.error.code
    })

    return fallbackFailure
  }

  private buildFailureFromAdapterError(
    runId: string,
    integrationId: IntegrationId,
    capability: ConnectorCapability,
    durationMs: number,
    backend: ConnectorBackend,
    adapterResult: ConnectorAdapterResult,
    attempts: ConnectorExecutionFailure['attempts']
  ): ConnectorExecutionFailure {
    if (adapterResult.success) {
      throw new Error('Cannot build failure from successful adapter result')
    }

    return {
      success: false,
      runId,
      integrationId,
      capability,
      backend,
      durationMs,
      error: adapterResult.error,
      attempts: [...attempts]
    }
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutError = new Error(
          `Connector execution timed out after ${timeoutMs}ms`
        ) as ConnectorTimeoutError
        timeoutError[TIMEOUT_ERROR] = true
        reject(timeoutError)
      }, timeoutMs)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }

  private asTimeoutError(error: unknown): ConnectorTimeoutError | null {
    if (error instanceof Error && (error as ConnectorTimeoutError)[TIMEOUT_ERROR] === true) {
      return error as ConnectorTimeoutError
    }
    return null
  }
}
