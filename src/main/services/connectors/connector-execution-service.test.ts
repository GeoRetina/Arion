import { describe, expect, it } from 'vitest'
import { ConnectorCapabilityRegistry } from './connector-capability-registry'
import { ConnectorExecutionService } from './connector-execution-service'
import type { ConnectorAdapter } from './adapters/connector-adapter'
import { ConnectorRunLogger } from './telemetry/connector-run-logger'

const createPolicyServiceStub = (allowed = true): never =>
  ({
    evaluate: async () => ({
      allowed,
      reason: allowed ? undefined : 'Denied by policy',
      timeoutMs: 5000,
      maxRetries: 0,
      approvalMode: 'always',
      allowedBackends: ['native', 'mcp', 'plugin']
    })
  }) as never

describe('ConnectorExecutionService', () => {
  it('falls back to the next backend when the first backend fails', async () => {
    const registry = new ConnectorCapabilityRegistry()
    const runLogger = new ConnectorRunLogger(100)

    const failingNativeAdapter: ConnectorAdapter = {
      id: 'native-fail',
      backend: 'native',
      supports: () => true,
      execute: async () => ({
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: 'Native failed',
          retryable: false
        }
      })
    }

    const successfulMcpAdapter: ConnectorAdapter = {
      id: 'mcp-ok',
      backend: 'mcp',
      supports: () => true,
      execute: async () => ({
        success: true,
        data: { ok: true }
      })
    }

    registry.register({
      integrationId: 'stac',
      capability: 'catalog.search',
      adapter: failingNativeAdapter,
      priority: 10
    })
    registry.register({
      integrationId: 'stac',
      capability: 'catalog.search',
      adapter: successfulMcpAdapter,
      priority: 10
    })

    const service = new ConnectorExecutionService(
      registry,
      createPolicyServiceStub(true),
      runLogger
    )

    const result = await service.execute({
      integrationId: 'stac',
      capability: 'catalog.search',
      input: {},
      chatId: 'chat-1'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.backend).toBe('mcp')
      expect(result.data).toEqual({ ok: true })
    }

    const logs = service.getRunLogs(5)
    expect(logs[0]?.outcome).toBe('success')
  })

  it('returns policy denial without attempting adapters', async () => {
    const registry = new ConnectorCapabilityRegistry()
    const runLogger = new ConnectorRunLogger(100)
    const service = new ConnectorExecutionService(
      registry,
      createPolicyServiceStub(false),
      runLogger
    )

    const result = await service.execute({
      integrationId: 's3',
      capability: 'storage.list',
      input: {},
      chatId: 'chat-2'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('POLICY_DENIED')
      expect(result.attempts).toEqual([])
    }
  })

  it('maps approval-required policy denials to APPROVAL_REQUIRED', async () => {
    const registry = new ConnectorCapabilityRegistry()
    const runLogger = new ConnectorRunLogger(100)
    const service = new ConnectorExecutionService(
      registry,
      {
        evaluate: async () => ({
          allowed: false,
          reason: 'Approval required for s3/storage.list (mode: once)',
          timeoutMs: 5000,
          maxRetries: 0,
          approvalMode: 'once',
          allowedBackends: ['native']
        })
      } as never,
      runLogger
    )

    const result = await service.execute({
      integrationId: 's3',
      capability: 'storage.list',
      input: {},
      chatId: 'chat-approval'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('APPROVAL_REQUIRED')
      expect(result.attempts).toEqual([])
    }
  })
})
