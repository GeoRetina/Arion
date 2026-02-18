import type { PluginPlatformConfig } from '../../../shared/ipc-types'
import type { PluginPolicyDecision, ResolvedPluginManifest } from './plugin-types'

const has = (collection: string[], value: string): boolean => collection.includes(value)

export class PluginPolicyService {
  public evaluate(
    manifest: ResolvedPluginManifest,
    config: PluginPlatformConfig
  ): PluginPolicyDecision {
    const pluginId = manifest.id
    const explicitlyEnabled = has(config.enabledPluginIds, pluginId)
    const explicitlyDisabled = has(config.disabledPluginIds, pluginId)

    if (!config.enabled) {
      return {
        active: false,
        reason: 'Plugin platform is disabled'
      }
    }

    if (has(config.denylist, pluginId)) {
      return {
        active: false,
        reason: 'Plugin is in denylist'
      }
    }

    if (config.allowlist.length > 0 && !has(config.allowlist, pluginId)) {
      return {
        active: false,
        reason: 'Plugin is not in allowlist'
      }
    }

    if (explicitlyDisabled) {
      return {
        active: false,
        reason: 'Plugin is explicitly disabled'
      }
    }

    if (manifest.source === 'bundled' && !config.enableBundledPlugins && !explicitlyEnabled) {
      return {
        active: false,
        reason: 'Bundled plugins are disabled by policy'
      }
    }

    if (Array.isArray(manifest.slots) && manifest.slots.length > 0) {
      for (const slot of manifest.slots) {
        const assignedPlugin = config.exclusiveSlotAssignments[slot]
        if (assignedPlugin && assignedPlugin !== pluginId) {
          return {
            active: false,
            reason: `Slot "${slot}" is assigned to "${assignedPlugin}"`
          }
        }
      }
    }

    if (explicitlyEnabled) {
      return { active: true }
    }

    if (manifest.enabledByDefault === false) {
      return {
        active: false,
        reason: 'Plugin requires explicit enablement'
      }
    }

    return { active: true }
  }
}
