import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginPlatformConfig, SkillPackConfig } from '../../../shared/ipc-types'
import type { SettingsService } from '../settings-service'
import { PluginLoaderService } from './plugin-loader-service'

interface CreatePluginOptions {
  id: string
  name?: string
  version?: string
  toolName: string
  sourceLabel: string
  configSchema?: Record<string, unknown>
}

function createPlugin(rootDir: string, options: CreatePluginOptions): string {
  fs.mkdirSync(rootDir, { recursive: true })
  fs.writeFileSync(
    path.join(rootDir, 'index.mjs'),
    `export default function activate(context) {
  context.registerTool({
    name: '${options.toolName}',
    description: 'tool from ${options.sourceLabel}',
    execute: async ({ args }) => ({ source: '${options.sourceLabel}', args })
  })
  context.registerHook({
    event: 'before_tool_call',
    mode: 'observe',
    handler: async () => {}
  })
}
`,
    'utf8'
  )

  fs.writeFileSync(
    path.join(rootDir, 'arion.plugin.json'),
    JSON.stringify(
      {
        id: options.id,
        name: options.name || options.id,
        version: options.version || '1.0.0',
        main: 'index.mjs',
        configSchema: options.configSchema
      },
      null,
      2
    ),
    'utf8'
  )

  return rootDir
}

describe('PluginLoaderService', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('applies precedence and ignores lower-precedence duplicate plugin ids', async () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-plugin-loader-'))
    tempDirs.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    createPlugin(path.join(workspaceRoot, 'plugins', 'dup-plugin'), {
      id: 'dup-plugin',
      toolName: 'workspace_tool',
      sourceLabel: 'workspace'
    })
    createPlugin(path.join(userDataRoot, 'plugins', 'dup-plugin'), {
      id: 'dup-plugin',
      toolName: 'global_tool',
      sourceLabel: 'global'
    })

    const pluginConfig: PluginPlatformConfig = {
      enabled: true,
      workspaceRoot,
      configuredPluginPaths: [],
      enableBundledPlugins: false,
      allowlist: [],
      denylist: [],
      enabledPluginIds: [],
      disabledPluginIds: [],
      exclusiveSlotAssignments: {},
      pluginConfigById: {}
    }
    const skillConfig: SkillPackConfig = { workspaceRoot }

    const settingsServiceStub = {
      getPluginPlatformConfig: async () => pluginConfig,
      getSkillPackConfig: async () => skillConfig
    } as SettingsService

    const loader = new PluginLoaderService({
      settingsService: settingsServiceStub,
      environment: {
        getUserDataPath: () => userDataRoot,
        getResourcesPath: () => resourcesRoot,
        getAppPath: () => appRoot,
        getCwd: () => workspaceRoot
      }
    })

    const snapshot = await loader.reload()

    expect(
      snapshot.inventory.some((item) => item.id === 'dup-plugin' && item.status === 'active')
    ).toBe(true)
    expect(
      snapshot.inventory.some((item) => item.id === 'dup-plugin' && item.status === 'ignored')
    ).toBe(true)
    expect(snapshot.diagnostics.some((entry) => entry.code === 'plugin_duplicate_ignored')).toBe(
      true
    )

    const tools = loader.getResolvedTools()
    expect(tools.map((tool) => tool.name)).toContain('workspace_tool')
    expect(tools.map((tool) => tool.name)).not.toContain('global_tool')
  })

  it('reports invalid runtime config against manifest schema', async () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arion-plugin-loader-config-'))
    tempDirs.push(testRoot)

    const workspaceRoot = path.join(testRoot, 'workspace')
    const userDataRoot = path.join(testRoot, 'user-data')
    const resourcesRoot = path.join(testRoot, 'resources')
    const appRoot = path.join(testRoot, 'app')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    fs.mkdirSync(userDataRoot, { recursive: true })
    fs.mkdirSync(resourcesRoot, { recursive: true })
    fs.mkdirSync(appRoot, { recursive: true })

    createPlugin(path.join(workspaceRoot, 'plugins', 'schema-plugin'), {
      id: 'schema-plugin',
      toolName: 'schema_tool',
      sourceLabel: 'workspace',
      configSchema: {
        type: 'object',
        properties: {
          retryCount: { type: 'integer', minimum: 1 }
        },
        required: ['retryCount']
      }
    })

    const settingsServiceStub = {
      getPluginPlatformConfig: async () =>
        ({
          enabled: true,
          workspaceRoot,
          configuredPluginPaths: [],
          enableBundledPlugins: false,
          allowlist: [],
          denylist: [],
          enabledPluginIds: [],
          disabledPluginIds: [],
          exclusiveSlotAssignments: {},
          pluginConfigById: {
            'schema-plugin': { retryCount: 0 }
          }
        }) as PluginPlatformConfig,
      getSkillPackConfig: async () => ({ workspaceRoot }) as SkillPackConfig
    } as SettingsService

    const loader = new PluginLoaderService({
      settingsService: settingsServiceStub,
      environment: {
        getUserDataPath: () => userDataRoot,
        getResourcesPath: () => resourcesRoot,
        getAppPath: () => appRoot,
        getCwd: () => workspaceRoot
      }
    })

    const snapshot = await loader.reload()

    expect(
      snapshot.inventory.some((item) => item.id === 'schema-plugin' && item.status === 'error')
    ).toBe(true)
    expect(snapshot.diagnostics.some((entry) => entry.code === 'plugin_config_invalid')).toBe(true)
    expect(loader.getResolvedTools()).toHaveLength(0)
  })
})
