import { describe, expect, it } from 'vitest'
import { ConnectorPolicyService } from './connector-policy-service'
import {
  DEFAULT_CONNECTOR_POLICY_CONFIG,
  normalizeConnectorPolicyConfig
} from './connector-policy-config'
import type { ConnectorPolicyConfig } from '../../../../shared/ipc-types'

function createSettingsStub(initial?: Partial<ConnectorPolicyConfig>): {
  service: ConnectorPolicyService
  state: ConnectorPolicyConfig
} {
  let state = normalizeConnectorPolicyConfig(initial || DEFAULT_CONNECTOR_POLICY_CONFIG)
  const settingsServiceStub = {
    getConnectorPolicyConfig: async () => state,
    setConnectorPolicyConfig: async (next: ConnectorPolicyConfig) => {
      state = normalizeConnectorPolicyConfig(next)
    }
  }

  return {
    service: new ConnectorPolicyService(settingsServiceStub as never),
    state
  }
}

describe('ConnectorPolicyService', () => {
  it('allows execution with default policy', async () => {
    const { service } = createSettingsStub()
    const decision = await service.evaluate({
      integrationId: 'stac',
      capability: 'catalog.search',
      chatId: 'chat-1'
    })

    expect(decision.allowed).toBe(true)
    expect(decision.allowedBackends).toContain('native')
  })

  it('denies integration when disabled in policy', async () => {
    const { service } = createSettingsStub({
      integrationPolicies: {
        s3: {
          enabled: false
        }
      }
    })

    const decision = await service.evaluate({
      integrationId: 's3',
      capability: 'storage.list',
      chatId: 'chat-1'
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('disabled')
  })

  it('requires approval for session mode until granted', async () => {
    const { service } = createSettingsStub({
      defaultApprovalMode: 'session',
      sensitiveCapabilities: ['sql.query']
    })

    const deniedDecision = await service.evaluate({
      integrationId: 'postgresql-postgis',
      capability: 'sql.query',
      chatId: 'chat-approvals'
    })
    expect(deniedDecision.allowed).toBe(false)

    service.grantSessionApproval('chat-approvals', 'postgresql-postgis', 'sql.query')

    const allowedDecision = await service.evaluate({
      integrationId: 'postgresql-postgis',
      capability: 'sql.query',
      chatId: 'chat-approvals'
    })
    expect(allowedDecision.allowed).toBe(true)
  })

  it('enforces strict mode default backend filtering', async () => {
    const { service } = createSettingsStub({
      strictMode: true
    })

    const decision = await service.evaluate({
      integrationId: 'stac',
      capability: 'catalog.search',
      chatId: 'chat-1'
    })

    expect(decision.allowed).toBe(true)
    expect(decision.allowedBackends).toEqual(['native'])
  })
})
