import { describe, expect, it } from 'vitest'
import type { PluginPlatformConfig } from '../../../shared/ipc-types'
import { PluginPolicyService } from './plugin-policy-service'
import type { ResolvedPluginManifest } from './plugin-types'

const baseConfig: PluginPlatformConfig = {
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

const manifest: ResolvedPluginManifest = {
  id: 'demo-plugin',
  name: 'Demo Plugin',
  version: '1.0.0',
  main: 'index.mjs',
  source: 'workspace',
  sourcePath: '/tmp/demo/arion.plugin.json',
  directoryPath: '/tmp/demo',
  resolvedMainPath: '/tmp/demo/index.mjs',
  precedence: 300,
  rootOrder: 0
}

describe('PluginPolicyService', () => {
  it('blocks denylisted plugin ids', () => {
    const policy = new PluginPolicyService()
    const decision = policy.evaluate(manifest, {
      ...baseConfig,
      denylist: ['demo-plugin']
    })

    expect(decision.active).toBe(false)
    expect(decision.reason).toContain('denylist')
  })

  it('blocks plugins not in allowlist when allowlist is set', () => {
    const policy = new PluginPolicyService()
    const decision = policy.evaluate(manifest, {
      ...baseConfig,
      allowlist: ['other-plugin']
    })

    expect(decision.active).toBe(false)
    expect(decision.reason).toContain('allowlist')
  })

  it('keeps bundled plugins disabled unless explicitly enabled when bundled toggle is off', () => {
    const policy = new PluginPolicyService()
    const bundledManifest: ResolvedPluginManifest = {
      ...manifest,
      id: 'bundled-plugin',
      source: 'bundled'
    }

    const disabledDecision = policy.evaluate(bundledManifest, baseConfig)
    expect(disabledDecision.active).toBe(false)
    expect(disabledDecision.reason).toContain('Bundled')

    const enabledDecision = policy.evaluate(bundledManifest, {
      ...baseConfig,
      enabledPluginIds: ['bundled-plugin']
    })
    expect(enabledDecision.active).toBe(true)
  })

  it('enforces exclusive slot assignments', () => {
    const policy = new PluginPolicyService()
    const slottedManifest: ResolvedPluginManifest = {
      ...manifest,
      slots: ['geocoder']
    }

    const deniedDecision = policy.evaluate(slottedManifest, {
      ...baseConfig,
      exclusiveSlotAssignments: {
        geocoder: 'other-plugin'
      }
    })
    expect(deniedDecision.active).toBe(false)
    expect(deniedDecision.reason).toContain('geocoder')

    const allowedDecision = policy.evaluate(slottedManifest, {
      ...baseConfig,
      exclusiveSlotAssignments: {
        geocoder: 'demo-plugin'
      }
    })
    expect(allowedDecision.active).toBe(true)
  })
})
