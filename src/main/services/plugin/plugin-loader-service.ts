import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import type {
  PluginDiagnosticEntry,
  PluginDiagnosticsSnapshot,
  PluginInventoryItem,
  PluginPlatformConfig,
  PluginToolInfo
} from '../../../shared/ipc-types'
import type { SettingsService } from '../settings-service'
import { createDiagnostic } from './plugin-diagnostic-utils'
import { PluginHookRunner } from './plugin-hook-runner'
import { PluginManifestService } from './plugin-manifest-service'
import { PluginPolicyService } from './plugin-policy-service'
import type {
  PluginActivationContext,
  PluginActivationResult,
  PluginDiscoveryCandidate,
  PluginDiscoveryRoot,
  PluginLoaderEnvironment,
  PluginModuleExports,
  PluginToolRegistration,
  ResolvedPluginManifest,
  ResolvedPluginTool
} from './plugin-types'
import { PLUGIN_HOOK_EVENTS, PLUGIN_MANIFEST_FILENAME } from './plugin-types'
import { validateJsonSchemaDefinition } from './json-schema-validator'

const DEFAULT_PLATFORM_CONFIG: PluginPlatformConfig = {
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

interface PluginLoaderDeps {
  settingsService: SettingsService
  environment?: Partial<PluginLoaderEnvironment>
  manifestService?: PluginManifestService
  policyService?: PluginPolicyService
  hookRunner?: PluginHookRunner
}

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/
const PLUGIN_HOOK_EVENT_SET = new Set<string>(PLUGIN_HOOK_EVENTS)

export class PluginLoaderService {
  private readonly settingsService: SettingsService
  private readonly environment: PluginLoaderEnvironment
  private readonly manifestService: PluginManifestService
  private readonly policyService: PluginPolicyService
  private readonly hookRunner: PluginHookRunner
  private runtimeTools: ResolvedPluginTool[] = []
  private runtimeState: {
    loadedAt: string
    config: PluginPlatformConfig
    inventory: PluginInventoryItem[]
    tools: PluginToolInfo[]
    diagnostics: PluginDiagnosticEntry[]
  } = {
    loadedAt: new Date(0).toISOString(),
    config: { ...DEFAULT_PLATFORM_CONFIG },
    inventory: [],
    tools: [],
    diagnostics: []
  }

  constructor(deps: PluginLoaderDeps) {
    this.settingsService = deps.settingsService
    this.environment = {
      getUserDataPath:
        deps.environment?.getUserDataPath ?? (() => path.join(process.cwd(), '.arion-user-data')),
      getAppPath: deps.environment?.getAppPath ?? (() => process.cwd()),
      getResourcesPath: deps.environment?.getResourcesPath ?? (() => process.resourcesPath || ''),
      getCwd: deps.environment?.getCwd ?? (() => process.cwd())
    }
    this.manifestService = deps.manifestService ?? new PluginManifestService()
    this.policyService = deps.policyService ?? new PluginPolicyService()
    this.hookRunner = deps.hookRunner ?? new PluginHookRunner()
  }

  public getHookRunner(): PluginHookRunner {
    return this.hookRunner
  }

  public getResolvedTools(): ResolvedPluginTool[] {
    return [...this.runtimeTools]
  }

  public appendDiagnostics(entries: PluginDiagnosticEntry[]): void {
    if (entries.length === 0) {
      return
    }
    this.runtimeState.diagnostics = [...this.runtimeState.diagnostics, ...entries]
  }

  public getDiagnosticsSnapshot(): PluginDiagnosticsSnapshot {
    return {
      loadedAt: this.runtimeState.loadedAt,
      runtimeEnabled: this.runtimeState.config.enabled,
      config: this.clonePlatformConfig(this.runtimeState.config),
      inventory: [...this.runtimeState.inventory],
      hooks: this.hookRunner.listHooks(),
      tools: [...this.runtimeState.tools],
      diagnostics: [...this.runtimeState.diagnostics]
    }
  }

  public async reload(): Promise<PluginDiagnosticsSnapshot> {
    const diagnostics: PluginDiagnosticEntry[] = []
    this.hookRunner.clear()
    this.runtimeTools = []

    let config = this.clonePlatformConfig(DEFAULT_PLATFORM_CONFIG)
    try {
      config = await this.settingsService.getPluginPlatformConfig()
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'plugin_config_load_failed',
          `Failed to read plugin platform config: ${error instanceof Error ? error.message : String(error)}`
        )
      )
    }

    const workspaceRoot = await this.resolveWorkspaceRoot(config)
    const roots = this.getDiscoveryRoots(config, workspaceRoot)
    const candidates = this.discoverCandidates(roots)
    const inventory: PluginInventoryItem[] = []
    const toolInfos: PluginToolInfo[] = []
    const toolNames = new Set<string>()

    const sortedCandidates = [...candidates].sort((a, b) => {
      if (a.precedence !== b.precedence) {
        return b.precedence - a.precedence
      }
      if (a.rootOrder !== b.rootOrder) {
        return a.rootOrder - b.rootOrder
      }
      return a.manifestPath.localeCompare(b.manifestPath)
    })

    const selectedByPluginId = new Map<string, ResolvedPluginManifest>()

    for (const candidate of sortedCandidates) {
      const parsedResult = this.manifestService.readManifest(candidate.manifestPath, {
        source: candidate.source,
        precedence: candidate.precedence,
        rootOrder: candidate.rootOrder
      })
      diagnostics.push(...parsedResult.diagnostics)
      if (!parsedResult.manifest) {
        continue
      }

      const manifest = parsedResult.manifest
      const existing = selectedByPluginId.get(manifest.id)
      if (existing) {
        diagnostics.push(
          createDiagnostic(
            'warning',
            'plugin_duplicate_ignored',
            `Plugin "${manifest.id}" ignored due to higher-precedence copy at "${existing.sourcePath}"`,
            { pluginId: manifest.id, sourcePath: manifest.sourcePath }
          )
        )
        inventory.push(
          this.buildInventoryItem(manifest, 'ignored', 'Duplicate plugin id (lower precedence)')
        )
        continue
      }
      selectedByPluginId.set(manifest.id, manifest)
    }

    for (const manifest of selectedByPluginId.values()) {
      const decision = this.policyService.evaluate(manifest, config)
      if (!decision.active) {
        inventory.push(this.buildInventoryItem(manifest, 'disabled', decision.reason))
        continue
      }

      const activationResult = await this.activatePlugin(manifest, config, toolNames, diagnostics)
      if (activationResult.status === 'error') {
        inventory.push(this.buildInventoryItem(manifest, 'error', activationResult.reason))
        continue
      }

      inventory.push(this.buildInventoryItem(manifest, 'active'))
      this.runtimeTools.push(...activationResult.tools)
      for (const tool of activationResult.tools) {
        toolInfos.push({
          pluginId: manifest.id,
          name: tool.name,
          category: tool.category
        })
      }
    }

    this.runtimeState = {
      loadedAt: new Date().toISOString(),
      config: this.clonePlatformConfig(config),
      inventory: inventory.sort((a, b) => a.id.localeCompare(b.id)),
      tools: toolInfos.sort((a, b) => a.name.localeCompare(b.name)),
      diagnostics
    }

    return this.getDiagnosticsSnapshot()
  }

  private async resolveWorkspaceRoot(config: PluginPlatformConfig): Promise<string> {
    if (typeof config.workspaceRoot === 'string' && config.workspaceRoot.trim().length > 0) {
      return path.resolve(config.workspaceRoot)
    }

    try {
      const skillPackConfig = await this.settingsService.getSkillPackConfig()
      if (
        typeof skillPackConfig.workspaceRoot === 'string' &&
        skillPackConfig.workspaceRoot.trim().length > 0
      ) {
        return path.resolve(skillPackConfig.workspaceRoot)
      }
    } catch {
      // Ignore and use cwd fallback.
    }

    return path.resolve(this.environment.getCwd())
  }

  private getDiscoveryRoots(
    config: PluginPlatformConfig,
    workspaceRoot: string
  ): PluginDiscoveryRoot[] {
    const userDataPath = this.environment.getUserDataPath()
    const appPath = this.environment.getAppPath()
    const resourcesPath = this.environment.getResourcesPath()
    const cwd = this.environment.getCwd()

    const configuredRoots = config.configuredPluginPaths.map((configuredPath) => ({
      source: 'configured' as const,
      dir: path.resolve(configuredPath),
      precedence: 400
    }))

    const unorderedRoots: Omit<PluginDiscoveryRoot, 'order'>[] = [
      ...configuredRoots,
      { source: 'workspace', dir: path.join(workspaceRoot, 'plugins'), precedence: 300 },
      { source: 'workspace', dir: path.join(workspaceRoot, '.arion', 'plugins'), precedence: 300 },
      { source: 'global', dir: path.join(userDataPath, 'plugins'), precedence: 200 },
      { source: 'bundled', dir: path.join(resourcesPath, 'plugins', 'bundled'), precedence: 100 },
      {
        source: 'bundled',
        dir: path.join(appPath, 'resources', 'plugins', 'bundled'),
        precedence: 100
      },
      { source: 'bundled', dir: path.join(cwd, 'resources', 'plugins', 'bundled'), precedence: 100 }
    ]

    return this.deduplicatePaths(unorderedRoots.map((root) => root.dir))
      .map((resolvedDir) => unorderedRoots.find((root) => path.resolve(root.dir) === resolvedDir))
      .filter((root): root is Omit<PluginDiscoveryRoot, 'order'> => Boolean(root))
      .map((root, order) => ({
        ...root,
        order
      }))
  }

  private discoverCandidates(roots: PluginDiscoveryRoot[]): PluginDiscoveryCandidate[] {
    const discovered: PluginDiscoveryCandidate[] = []
    const seenManifestPaths = new Set<string>()

    for (const root of roots) {
      const rootPath = path.resolve(root.dir)
      if (!fs.existsSync(rootPath)) {
        continue
      }

      let rootStat: fs.Stats
      try {
        rootStat = fs.statSync(rootPath)
      } catch {
        continue
      }

      if (rootStat.isFile()) {
        if (path.basename(rootPath) !== PLUGIN_MANIFEST_FILENAME) {
          continue
        }
        const manifestPath = rootPath
        if (!seenManifestPaths.has(manifestPath)) {
          seenManifestPaths.add(manifestPath)
          discovered.push({
            source: root.source,
            manifestPath,
            rootDir: path.dirname(manifestPath),
            precedence: root.precedence,
            rootOrder: root.order
          })
        }
        continue
      }

      if (!rootStat.isDirectory()) {
        continue
      }

      const rootManifestPath = path.join(rootPath, PLUGIN_MANIFEST_FILENAME)
      if (fs.existsSync(rootManifestPath) && !seenManifestPaths.has(rootManifestPath)) {
        seenManifestPaths.add(rootManifestPath)
        discovered.push({
          source: root.source,
          manifestPath: rootManifestPath,
          rootDir: rootPath,
          precedence: root.precedence,
          rootOrder: root.order
        })
      }

      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(rootPath, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }
        const pluginDir = path.join(rootPath, entry.name)
        const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_FILENAME)
        if (!fs.existsSync(manifestPath) || seenManifestPaths.has(manifestPath)) {
          continue
        }

        seenManifestPaths.add(manifestPath)
        discovered.push({
          source: root.source,
          manifestPath,
          rootDir: pluginDir,
          precedence: root.precedence,
          rootOrder: root.order
        })
      }
    }

    return discovered
  }

  private async activatePlugin(
    manifest: ResolvedPluginManifest,
    config: PluginPlatformConfig,
    toolNames: Set<string>,
    diagnostics: PluginDiagnosticEntry[]
  ): Promise<
    { status: 'active'; tools: ResolvedPluginTool[] } | { status: 'error'; reason: string }
  > {
    const runtimeConfig = this.resolvePluginConfig(manifest, config)
    const configDiagnostics = this.manifestService.validateRuntimeConfig(manifest, runtimeConfig)
    if (configDiagnostics.length > 0) {
      diagnostics.push(...configDiagnostics)
      return {
        status: 'error',
        reason: 'Runtime config failed manifest schema validation'
      }
    }

    let pluginModule: PluginModuleExports
    try {
      pluginModule = (await import(
        pathToFileURL(manifest.resolvedMainPath).href
      )) as PluginModuleExports
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'plugin_import_failed',
          `Failed to import plugin module: ${error instanceof Error ? error.message : String(error)}`,
          { pluginId: manifest.id, sourcePath: manifest.sourcePath }
        )
      )
      return {
        status: 'error',
        reason: 'Plugin module import failed'
      }
    }

    const collectedTools: ResolvedPluginTool[] = []
    const registerTool = (tool: PluginToolRegistration): void => {
      const normalized = this.normalizePluginTool(
        manifest,
        runtimeConfig,
        tool,
        toolNames,
        diagnostics
      )
      if (!normalized) {
        return
      }
      collectedTools.push(normalized)
    }

    const registerHook = (hook: unknown): void => {
      if (!hook || typeof hook !== 'object') {
        diagnostics.push(
          createDiagnostic('error', 'plugin_hook_invalid', 'Hook registration must be an object', {
            pluginId: manifest.id
          })
        )
        return
      }

      const hookRecord = hook as {
        event?: unknown
        mode?: unknown
        priority?: unknown
        handler?: unknown
      }

      const event =
        typeof hookRecord.event === 'string' && PLUGIN_HOOK_EVENT_SET.has(hookRecord.event)
          ? (hookRecord.event as (typeof PLUGIN_HOOK_EVENTS)[number])
          : null
      if (!event) {
        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_hook_event_invalid',
            'Hook event is invalid or unsupported',
            {
              pluginId: manifest.id
            }
          )
        )
        return
      }

      const mode =
        hookRecord.mode === 'modify' || hookRecord.mode === 'observe' ? hookRecord.mode : null
      if (!mode) {
        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_hook_mode_invalid',
            'Hook mode must be "modify" or "observe"',
            {
              pluginId: manifest.id
            }
          )
        )
        return
      }

      if (typeof hookRecord.handler !== 'function') {
        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_hook_handler_invalid',
            'Hook handler must be a function',
            { pluginId: manifest.id }
          )
        )
        return
      }

      const priority =
        typeof hookRecord.priority === 'number' && Number.isFinite(hookRecord.priority)
          ? hookRecord.priority
          : 100

      this.hookRunner.register(manifest.id, {
        event,
        mode,
        priority,
        handler: hookRecord.handler as (
          payload: unknown,
          context: Record<string, unknown>
        ) => unknown
      })
    }

    const context: PluginActivationContext = {
      manifest,
      config: runtimeConfig,
      registerTool,
      registerHook: (hook) => registerHook(hook),
      log: (message: string) => {
        diagnostics.push(
          createDiagnostic('info', 'plugin_log', message, {
            pluginId: manifest.id,
            sourcePath: manifest.sourcePath
          })
        )
      }
    }

    if (Array.isArray(pluginModule.tools)) {
      pluginModule.tools.forEach((tool) => registerTool(tool))
    }
    if (Array.isArray(pluginModule.hooks)) {
      pluginModule.hooks.forEach((hook) => registerHook(hook))
    }

    const activationFn =
      typeof pluginModule.activate === 'function'
        ? pluginModule.activate
        : typeof pluginModule.default === 'function'
          ? pluginModule.default
          : null

    if (!activationFn && !Array.isArray(pluginModule.tools) && !Array.isArray(pluginModule.hooks)) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'plugin_activation_missing',
          'Plugin must export activate/default function or static tools/hooks arrays',
          { pluginId: manifest.id, sourcePath: manifest.sourcePath }
        )
      )
      return {
        status: 'error',
        reason: 'No activation entrypoint found'
      }
    }

    if (activationFn) {
      try {
        const activationResult = (await activationFn(context)) as PluginActivationResult | undefined
        if (activationResult?.tools && Array.isArray(activationResult.tools)) {
          activationResult.tools.forEach((tool) => registerTool(tool))
        }
        if (activationResult?.hooks && Array.isArray(activationResult.hooks)) {
          activationResult.hooks.forEach((hook) => registerHook(hook))
        }
      } catch (error) {
        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_activation_failed',
            `Plugin activation failed: ${error instanceof Error ? error.message : String(error)}`,
            { pluginId: manifest.id, sourcePath: manifest.sourcePath }
          )
        )
        return {
          status: 'error',
          reason: 'Activation function failed'
        }
      }
    }

    return { status: 'active', tools: collectedTools }
  }

  private normalizePluginTool(
    manifest: ResolvedPluginManifest,
    runtimeConfig: Record<string, unknown>,
    tool: PluginToolRegistration,
    toolNames: Set<string>,
    diagnostics: PluginDiagnosticEntry[]
  ): ResolvedPluginTool | null {
    const normalizedName =
      typeof tool.name === 'string' && tool.name.trim().length > 0 ? tool.name.trim() : ''
    if (!normalizedName || !TOOL_NAME_PATTERN.test(normalizedName)) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'plugin_tool_name_invalid',
          `Invalid tool name "${tool.name}". Names must match ${TOOL_NAME_PATTERN.source}`,
          { pluginId: manifest.id }
        )
      )
      return null
    }

    if (toolNames.has(normalizedName)) {
      diagnostics.push(
        createDiagnostic(
          'warning',
          'plugin_tool_duplicate',
          `Tool "${normalizedName}" already registered by another plugin. Duplicate ignored.`,
          { pluginId: manifest.id }
        )
      )
      return null
    }

    if (typeof tool.description !== 'string' || tool.description.trim().length === 0) {
      diagnostics.push(
        createDiagnostic(
          'error',
          'plugin_tool_description_missing',
          `Tool "${normalizedName}" requires a non-empty description`,
          { pluginId: manifest.id }
        )
      )
      return null
    }

    if (typeof tool.execute !== 'function') {
      diagnostics.push(
        createDiagnostic(
          'error',
          'plugin_tool_execute_invalid',
          `Tool "${normalizedName}" execute must be a function`,
          { pluginId: manifest.id }
        )
      )
      return null
    }

    if (tool.inputSchema) {
      const schemaErrors = validateJsonSchemaDefinition(tool.inputSchema)
      if (schemaErrors.length > 0) {
        diagnostics.push(
          createDiagnostic(
            'error',
            'plugin_tool_schema_invalid',
            `Tool "${normalizedName}" input schema invalid: ${schemaErrors.join('; ')}`,
            { pluginId: manifest.id }
          )
        )
        return null
      }
    }

    toolNames.add(normalizedName)

    const category =
      typeof tool.category === 'string' && tool.category.trim().length > 0
        ? tool.category.trim()
        : typeof manifest.category === 'string' && manifest.category.trim().length > 0
          ? manifest.category.trim()
          : `plugin:${manifest.id}`

    return {
      pluginId: manifest.id,
      name: normalizedName,
      description: tool.description.trim(),
      category,
      inputSchema: tool.inputSchema,
      execute: async ({ args, chatId }) =>
        tool.execute({ args, chatId, pluginConfig: runtimeConfig })
    }
  }

  private resolvePluginConfig(
    manifest: ResolvedPluginManifest,
    config: PluginPlatformConfig
  ): Record<string, unknown> {
    const baseConfig =
      manifest.defaultConfig && typeof manifest.defaultConfig === 'object'
        ? manifest.defaultConfig
        : {}
    const configured = config.pluginConfigById[manifest.id]
    const configuredObject =
      configured && typeof configured === 'object' && !Array.isArray(configured)
        ? (configured as Record<string, unknown>)
        : {}

    return {
      ...baseConfig,
      ...configuredObject
    }
  }

  private buildInventoryItem(
    manifest: ResolvedPluginManifest,
    status: PluginInventoryItem['status'],
    reason?: string
  ): PluginInventoryItem {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      source: manifest.source,
      sourcePath: manifest.sourcePath,
      mainPath: manifest.resolvedMainPath || null,
      category: manifest.category,
      slots: manifest.slots || [],
      status,
      hasConfigSchema: Boolean(manifest.configSchema),
      reason
    }
  }

  private deduplicatePaths(pathsToDedupe: string[]): string[] {
    const seen = new Set<string>()
    const output: string[] = []
    for (const candidatePath of pathsToDedupe) {
      const resolved = path.resolve(candidatePath)
      if (seen.has(resolved)) {
        continue
      }
      seen.add(resolved)
      output.push(resolved)
    }
    return output
  }

  private clonePlatformConfig(config: PluginPlatformConfig): PluginPlatformConfig {
    return {
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
    }
  }
}
