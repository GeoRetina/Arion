import type {
  ConnectorApprovalMode,
  ConnectorBackend,
  ConnectorCapability,
  ConnectorPolicyConfig,
  IntegrationId
} from '../../../../shared/ipc-types'
import type { SettingsService } from '../../settings-service'
import {
  DEFAULT_CONNECTOR_POLICY_CONFIG,
  normalizeConnectorPolicyConfig
} from './connector-policy-config'

const ALL_CONNECTOR_BACKENDS: ConnectorBackend[] = ['native', 'mcp', 'plugin']

interface PolicyResolutionInput {
  integrationId: IntegrationId
  capability: ConnectorCapability
  chatId?: string
}

export interface ConnectorPolicyDecision {
  allowed: boolean
  reason?: string
  timeoutMs: number
  maxRetries: number
  approvalMode: ConnectorApprovalMode
  allowedBackends: ConnectorBackend[]
}

const buildApprovalKey = (
  chatId: string | undefined,
  integrationId: IntegrationId,
  capability: ConnectorCapability
): string => `${chatId || '__global__'}:${integrationId}:${capability}`

export class ConnectorPolicyService {
  private readonly sessionApprovals = new Set<string>()
  private readonly oneTimeApprovals = new Map<string, number>()

  constructor(private readonly settingsService: SettingsService) {}

  public async getPolicyConfig(): Promise<ConnectorPolicyConfig> {
    try {
      const loaded = await this.settingsService.getConnectorPolicyConfig()
      return normalizeConnectorPolicyConfig(loaded)
    } catch {
      return normalizeConnectorPolicyConfig(DEFAULT_CONNECTOR_POLICY_CONFIG)
    }
  }

  public async setPolicyConfig(config: ConnectorPolicyConfig): Promise<void> {
    const safeConfig = normalizeConnectorPolicyConfig(config)
    await this.settingsService.setConnectorPolicyConfig(safeConfig)
  }

  public async evaluate(input: PolicyResolutionInput): Promise<ConnectorPolicyDecision> {
    const config = await this.getPolicyConfig()
    const integrationPolicy = config.integrationPolicies[input.integrationId]
    const capabilityPolicy = integrationPolicy?.capabilities?.[input.capability]

    const timeoutMs = capabilityPolicy?.timeoutMs || config.defaultTimeoutMs
    const maxRetries =
      typeof capabilityPolicy?.maxRetries === 'number'
        ? capabilityPolicy.maxRetries
        : config.defaultMaxRetries

    if (!config.enabled) {
      return {
        allowed: true,
        timeoutMs,
        maxRetries,
        approvalMode: 'always',
        allowedBackends: [...ALL_CONNECTOR_BACKENDS]
      }
    }

    if (integrationPolicy?.enabled === false) {
      return this.buildDeniedDecision(
        `Integration "${input.integrationId}" is disabled by policy`,
        timeoutMs,
        maxRetries
      )
    }

    if (capabilityPolicy?.enabled === false) {
      return this.buildDeniedDecision(
        `Capability "${input.capability}" is disabled by policy`,
        timeoutMs,
        maxRetries
      )
    }

    const requestedAllowedBackends =
      capabilityPolicy?.allowedBackends && capabilityPolicy.allowedBackends.length > 0
        ? capabilityPolicy.allowedBackends
        : config.defaultAllowedBackends

    const allowedBackends = requestedAllowedBackends.filter(
      (backend) => !config.backendDenylist.includes(backend)
    )

    const strictFilteredBackends =
      config.strictMode &&
      !(capabilityPolicy?.allowedBackends && capabilityPolicy.allowedBackends.length > 0)
        ? allowedBackends.filter((backend) => backend === 'native')
        : allowedBackends

    if (strictFilteredBackends.length === 0) {
      return this.buildDeniedDecision(
        `No connector backend is allowed for "${input.integrationId}/${input.capability}"`,
        timeoutMs,
        maxRetries
      )
    }

    const isSensitive = config.sensitiveCapabilities.includes(input.capability)
    const approvalMode =
      capabilityPolicy?.approvalMode || (isSensitive ? config.defaultApprovalMode : 'always')

    if (approvalMode !== 'always') {
      const isApproved = this.consumeApprovalIfAvailable(
        approvalMode,
        input.chatId,
        input.integrationId,
        input.capability
      )
      if (!isApproved) {
        return this.buildDeniedDecision(
          `Approval required for ${input.integrationId}/${input.capability} (mode: ${approvalMode})`,
          timeoutMs,
          maxRetries,
          approvalMode,
          strictFilteredBackends
        )
      }
    }

    return {
      allowed: true,
      timeoutMs,
      maxRetries,
      approvalMode,
      allowedBackends: strictFilteredBackends
    }
  }

  public grantSessionApproval(
    chatId: string,
    integrationId: IntegrationId,
    capability: ConnectorCapability
  ): void {
    if (!chatId.trim()) {
      return
    }
    this.sessionApprovals.add(buildApprovalKey(chatId, integrationId, capability))
  }

  public grantOneTimeApproval(
    chatId: string | undefined,
    integrationId: IntegrationId,
    capability: ConnectorCapability
  ): void {
    const key = buildApprovalKey(chatId, integrationId, capability)
    const current = this.oneTimeApprovals.get(key) || 0
    this.oneTimeApprovals.set(key, current + 1)
  }

  public clearSessionApprovals(chatId?: string): void {
    if (!chatId) {
      this.sessionApprovals.clear()
      this.oneTimeApprovals.clear()
      return
    }

    const normalized = chatId.trim()
    if (!normalized) {
      return
    }

    for (const key of this.sessionApprovals) {
      if (key.startsWith(`${normalized}:`)) {
        this.sessionApprovals.delete(key)
      }
    }
    for (const key of this.oneTimeApprovals.keys()) {
      if (key.startsWith(`${normalized}:`)) {
        this.oneTimeApprovals.delete(key)
      }
    }
  }

  private consumeApprovalIfAvailable(
    approvalMode: ConnectorApprovalMode,
    chatId: string | undefined,
    integrationId: IntegrationId,
    capability: ConnectorCapability
  ): boolean {
    const key = buildApprovalKey(chatId, integrationId, capability)
    if (approvalMode === 'session') {
      return this.sessionApprovals.has(key)
    }
    if (approvalMode === 'once') {
      const remaining = this.oneTimeApprovals.get(key) || 0
      if (remaining <= 0) {
        return false
      }
      if (remaining === 1) {
        this.oneTimeApprovals.delete(key)
      } else {
        this.oneTimeApprovals.set(key, remaining - 1)
      }
      return true
    }
    return true
  }

  private buildDeniedDecision(
    reason: string,
    timeoutMs: number,
    maxRetries: number,
    approvalMode: ConnectorApprovalMode = 'always',
    allowedBackends: ConnectorBackend[] = []
  ): ConnectorPolicyDecision {
    return {
      allowed: false,
      reason,
      timeoutMs,
      maxRetries,
      approvalMode,
      allowedBackends
    }
  }
}
