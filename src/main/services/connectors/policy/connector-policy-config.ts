import type {
  ConnectorApprovalMode,
  ConnectorBackend,
  ConnectorCapabilityPolicy,
  ConnectorIntegrationPolicy,
  ConnectorPolicyConfig
} from '../../../../shared/ipc-types'
import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from '../constants'

const KNOWN_BACKENDS: ConnectorBackend[] = ['native', 'mcp', 'plugin']
const KNOWN_APPROVAL_MODES: ConnectorApprovalMode[] = ['once', 'session', 'always']
const DEFAULT_ALLOWED_BACKENDS: ConnectorBackend[] = ['native']
const DEFAULT_BLOCKED_MCP_TOOL_NAMES: string[] = [
  'close_connection',
  'connect_database',
  'delete_record',
  'describe_schema',
  'execute_select_query',
  'execute_spatial_query',
  'get_table_statistics',
  'insert_record',
  'list_connections',
  'update_record'
]

export const DEFAULT_CONNECTOR_POLICY_CONFIG: ConnectorPolicyConfig = {
  enabled: true,
  strictMode: false,
  defaultApprovalMode: 'always',
  defaultTimeoutMs: 10000,
  defaultMaxRetries: 1,
  defaultAllowedBackends: [...DEFAULT_ALLOWED_BACKENDS],
  backendDenylist: [],
  sensitiveCapabilities: ['sql.query', 'storage.list', 'gee.listAlgorithms'],
  blockedMcpToolNames: [...DEFAULT_BLOCKED_MCP_TOOL_NAMES],
  integrationPolicies: {}
}

const sanitizeBackendList = (value: unknown): ConnectorBackend[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const unique = new Set<ConnectorBackend>()
  for (const rawBackend of value) {
    if (typeof rawBackend !== 'string') {
      continue
    }
    const normalized = rawBackend.trim() as ConnectorBackend
    if (KNOWN_BACKENDS.includes(normalized)) {
      unique.add(normalized)
    }
  }
  return Array.from(unique.values())
}

const sanitizeApprovalMode = (
  value: unknown,
  fallback: ConnectorApprovalMode
): ConnectorApprovalMode => {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim() as ConnectorApprovalMode
  return KNOWN_APPROVAL_MODES.includes(normalized) ? normalized : fallback
}

const sanitizeTimeout = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)))
  }
  return fallback
}

const sanitizeMaxRetries = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(5, Math.max(0, Math.floor(value)))
  }
  return fallback
}

const normalizeCapabilityPolicy = (rawPolicy: unknown): ConnectorCapabilityPolicy | undefined => {
  if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
    return undefined
  }

  const record = rawPolicy as Record<string, unknown>
  const normalized: ConnectorCapabilityPolicy = {}

  if (typeof record.enabled === 'boolean') {
    normalized.enabled = record.enabled
  }

  if ('approvalMode' in record) {
    normalized.approvalMode = sanitizeApprovalMode(
      record.approvalMode,
      DEFAULT_CONNECTOR_POLICY_CONFIG.defaultApprovalMode
    )
  }

  if ('timeoutMs' in record) {
    normalized.timeoutMs = sanitizeTimeout(
      record.timeoutMs,
      DEFAULT_CONNECTOR_POLICY_CONFIG.defaultTimeoutMs
    )
  }

  if ('maxRetries' in record) {
    normalized.maxRetries = sanitizeMaxRetries(
      record.maxRetries,
      DEFAULT_CONNECTOR_POLICY_CONFIG.defaultMaxRetries
    )
  }

  if ('allowedBackends' in record) {
    normalized.allowedBackends = sanitizeBackendList(record.allowedBackends)
  }

  return normalized
}

const normalizeIntegrationPolicy = (rawPolicy: unknown): ConnectorIntegrationPolicy | undefined => {
  if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
    return undefined
  }

  const record = rawPolicy as Record<string, unknown>
  const normalizedCapabilities: Record<string, ConnectorCapabilityPolicy> = {}
  const rawCapabilities = record.capabilities

  if (rawCapabilities && typeof rawCapabilities === 'object' && !Array.isArray(rawCapabilities)) {
    for (const [capability, capabilityPolicy] of Object.entries(
      rawCapabilities as Record<string, unknown>
    )) {
      const normalizedCapabilityPolicy = normalizeCapabilityPolicy(capabilityPolicy)
      if (!normalizedCapabilityPolicy) {
        continue
      }
      const normalizedCapability = capability.trim()
      if (normalizedCapability.length === 0) {
        continue
      }
      normalizedCapabilities[normalizedCapability] = normalizedCapabilityPolicy
    }
  }

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
    capabilities: normalizedCapabilities
  }
}

const sanitizeSensitiveCapabilities = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CONNECTOR_POLICY_CONFIG.sensitiveCapabilities]
  }
  const unique = new Set<string>()
  for (const rawCapability of value) {
    if (typeof rawCapability !== 'string') {
      continue
    }
    const normalized = rawCapability.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }
  return Array.from(unique.values()).sort((left, right) => left.localeCompare(right))
}

const sanitizeMcpToolNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const unique = new Set<string>()
  for (const rawName of value) {
    if (typeof rawName !== 'string') {
      continue
    }

    const normalized = rawName.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }

  return Array.from(unique.values()).sort((left, right) => left.localeCompare(right))
}

export const normalizeConnectorPolicyConfig = (
  rawConfig: Partial<ConnectorPolicyConfig> | null | undefined
): ConnectorPolicyConfig => {
  const integrationPolicies: Record<string, ConnectorIntegrationPolicy> = {}
  if (
    rawConfig?.integrationPolicies &&
    typeof rawConfig.integrationPolicies === 'object' &&
    !Array.isArray(rawConfig.integrationPolicies)
  ) {
    for (const [integrationId, integrationPolicy] of Object.entries(
      rawConfig.integrationPolicies
    )) {
      const normalizedIntegrationPolicy = normalizeIntegrationPolicy(integrationPolicy)
      if (!normalizedIntegrationPolicy) {
        continue
      }
      integrationPolicies[integrationId.trim()] = normalizedIntegrationPolicy
    }
  }

  const sanitizedDefaultAllowedBackends = sanitizeBackendList(rawConfig?.defaultAllowedBackends)
  const sanitizedBackendDenylist = sanitizeBackendList(rawConfig?.backendDenylist)
  const hasExplicitBlockedMcpToolNames = Array.isArray(rawConfig?.blockedMcpToolNames)
  const sanitizedBlockedMcpToolNames = sanitizeMcpToolNames(rawConfig?.blockedMcpToolNames)

  return {
    enabled: rawConfig?.enabled !== false,
    strictMode: rawConfig?.strictMode === true,
    defaultApprovalMode: sanitizeApprovalMode(
      rawConfig?.defaultApprovalMode,
      DEFAULT_CONNECTOR_POLICY_CONFIG.defaultApprovalMode
    ),
    defaultTimeoutMs: sanitizeTimeout(
      rawConfig?.defaultTimeoutMs,
      DEFAULT_CONNECTOR_POLICY_CONFIG.defaultTimeoutMs
    ),
    defaultMaxRetries: sanitizeMaxRetries(
      rawConfig?.defaultMaxRetries,
      DEFAULT_CONNECTOR_POLICY_CONFIG.defaultMaxRetries
    ),
    defaultAllowedBackends:
      sanitizedDefaultAllowedBackends.length > 0
        ? sanitizedDefaultAllowedBackends
        : [...DEFAULT_CONNECTOR_POLICY_CONFIG.defaultAllowedBackends],
    backendDenylist: sanitizedBackendDenylist,
    sensitiveCapabilities: sanitizeSensitiveCapabilities(rawConfig?.sensitiveCapabilities),
    blockedMcpToolNames: hasExplicitBlockedMcpToolNames
      ? sanitizedBlockedMcpToolNames
      : [...DEFAULT_CONNECTOR_POLICY_CONFIG.blockedMcpToolNames],
    integrationPolicies
  }
}
