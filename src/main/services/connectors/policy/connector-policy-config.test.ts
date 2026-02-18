import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONNECTOR_POLICY_CONFIG,
  normalizeConnectorPolicyConfig
} from './connector-policy-config'

describe('normalizeConnectorPolicyConfig', () => {
  it('applies default MCP blocklist when policy omits it', () => {
    const normalized = normalizeConnectorPolicyConfig({
      enabled: true
    })

    expect(normalized.blockedMcpToolNames).toEqual(
      DEFAULT_CONNECTOR_POLICY_CONFIG.blockedMcpToolNames
    )
  })

  it('preserves an explicit empty MCP blocklist', () => {
    const normalized = normalizeConnectorPolicyConfig({
      blockedMcpToolNames: []
    })

    expect(normalized.blockedMcpToolNames).toEqual([])
  })

  it('sanitizes MCP blocklist entries', () => {
    const normalized = normalizeConnectorPolicyConfig({
      blockedMcpToolNames: [' connect_database ', '', 'execute_select_query', 'connect_database']
    })

    expect(normalized.blockedMcpToolNames).toEqual(['connect_database', 'execute_select_query'])
  })
})
