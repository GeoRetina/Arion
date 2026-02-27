import type {
  ConnectorPolicyConfig,
  EmbeddingConfig,
  EmbeddingProviderType,
  PluginPlatformConfig,
  SkillPackConfig,
  SystemPromptConfig
} from '../../../shared/ipc-types'
import {
  DEFAULT_EMBEDDING_MODEL_BY_PROVIDER,
  DEFAULT_EMBEDDING_PROVIDER,
  SUPPORTED_EMBEDDING_PROVIDERS
} from '../../../shared/embedding-constants'
import {
  DEFAULT_CONNECTOR_POLICY_CONFIG,
  normalizeConnectorPolicyConfig
} from '../connectors/policy/connector-policy-config'

export const SERVICE_NAME = 'ArionLLMCredentials'
export const DB_FILENAME = 'arion-settings.db'
export const EMBEDDING_CONFIG_KEY = 'embeddingConfig'

export const DEFAULT_SYSTEM_PROMPT_CONFIG: SystemPromptConfig = {
  userSystemPrompt: ''
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: DEFAULT_EMBEDDING_PROVIDER,
  model: DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[DEFAULT_EMBEDDING_PROVIDER]
}

const SUPPORTED_EMBEDDING_PROVIDER_SET = new Set<EmbeddingProviderType>(
  SUPPORTED_EMBEDDING_PROVIDERS
)

export const DEFAULT_SKILL_PACK_CONFIG: SkillPackConfig = {
  workspaceRoot: null,
  disabledSkillIds: []
}

export const DEFAULT_PLUGIN_PLATFORM_CONFIG: PluginPlatformConfig = {
  enabled: true,
  workspaceRoot: null,
  configuredPluginPaths: [],
  enableBundledPlugins: false,
  allowlist: [],
  denylist: [],
  enabledPluginIds: [],
  disabledPluginIds: [],
  exclusiveSlotAssignments: {},
  pluginConfigById: {}
}

export const DEFAULT_NORMALIZED_CONNECTOR_POLICY_CONFIG = normalizeConnectorPolicyConfig(
  DEFAULT_CONNECTOR_POLICY_CONFIG
)

export const normalizeEmbeddingConfig = (
  config: Partial<EmbeddingConfig> | null | undefined
): EmbeddingConfig => {
  const requestedProvider = config?.provider
  const provider = SUPPORTED_EMBEDDING_PROVIDER_SET.has(requestedProvider as EmbeddingProviderType)
    ? (requestedProvider as EmbeddingProviderType)
    : DEFAULT_EMBEDDING_CONFIG.provider

  const requestedModel =
    typeof config?.model === 'string' && config.model.trim().length > 0
      ? config.model.trim()
      : DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[provider]

  return {
    provider,
    model: requestedModel
  }
}

const sanitizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    const normalized = item.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const normalizeSkillId = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const normalizeSkillIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    const normalized = normalizeSkillId(item)
    if (!normalized || normalized === '.' || normalized === '..') {
      continue
    }

    unique.add(normalized)
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

export const normalizeSkillPackConfig = (
  config: Partial<SkillPackConfig> | null | undefined
): SkillPackConfig => {
  return {
    workspaceRoot:
      typeof config?.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
        ? config.workspaceRoot.trim()
        : null,
    disabledSkillIds: normalizeSkillIdList(config?.disabledSkillIds)
  }
}

const sanitizeExclusiveSlotAssignments = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const output: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue !== 'string') {
      continue
    }

    const slot = rawKey.trim()
    const pluginId = rawValue.trim()
    if (!slot || !pluginId) {
      continue
    }

    output[slot] = pluginId
  }

  return output
}

export const normalizePluginPlatformConfig = (
  config: Partial<PluginPlatformConfig> | null | undefined
): PluginPlatformConfig => {
  const normalizedWorkspaceRoot =
    typeof config?.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0
      ? config.workspaceRoot.trim()
      : null

  const pluginConfigById =
    config?.pluginConfigById && typeof config.pluginConfigById === 'object'
      ? (config.pluginConfigById as Record<string, unknown>)
      : {}

  return {
    enabled: config?.enabled !== false,
    workspaceRoot: normalizedWorkspaceRoot,
    configuredPluginPaths: sanitizeStringList(config?.configuredPluginPaths),
    enableBundledPlugins: config?.enableBundledPlugins === true,
    allowlist: sanitizeStringList(config?.allowlist),
    denylist: sanitizeStringList(config?.denylist),
    enabledPluginIds: sanitizeStringList(config?.enabledPluginIds),
    disabledPluginIds: sanitizeStringList(config?.disabledPluginIds),
    exclusiveSlotAssignments: sanitizeExclusiveSlotAssignments(config?.exclusiveSlotAssignments),
    pluginConfigById
  }
}

export const clonePluginPlatformConfig = (config: PluginPlatformConfig): PluginPlatformConfig => ({
  enabled: config.enabled,
  workspaceRoot: config.workspaceRoot,
  configuredPluginPaths: [...config.configuredPluginPaths],
  enableBundledPlugins: config.enableBundledPlugins,
  allowlist: [...config.allowlist],
  denylist: [...config.denylist],
  enabledPluginIds: [...config.enabledPluginIds],
  disabledPluginIds: [...config.disabledPluginIds],
  exclusiveSlotAssignments: { ...config.exclusiveSlotAssignments },
  pluginConfigById: { ...config.pluginConfigById }
})

export const cloneConnectorPolicyConfig = (
  config: ConnectorPolicyConfig
): ConnectorPolicyConfig => ({
  enabled: config.enabled,
  strictMode: config.strictMode,
  defaultApprovalMode: config.defaultApprovalMode,
  defaultTimeoutMs: config.defaultTimeoutMs,
  defaultMaxRetries: config.defaultMaxRetries,
  defaultAllowedBackends: [...config.defaultAllowedBackends],
  backendDenylist: [...config.backendDenylist],
  sensitiveCapabilities: [...config.sensitiveCapabilities],
  blockedMcpToolNames: [...config.blockedMcpToolNames],
  integrationPolicies: Object.fromEntries(
    Object.entries(config.integrationPolicies).map(([integrationId, policy]) => [
      integrationId,
      {
        enabled: policy.enabled,
        capabilities: policy.capabilities ? { ...policy.capabilities } : {}
      }
    ])
  )
})
