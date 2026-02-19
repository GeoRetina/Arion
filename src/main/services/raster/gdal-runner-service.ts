import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { app } from 'electron'
import { delimiter, join } from 'path'

const DEFAULT_COMMAND_TIMEOUT_MS = 2 * 60 * 1000
const AVAILABILITY_TIMEOUT_MS = 8 * 1000

export type GdalToolName = 'gdalinfo' | 'gdalwarp' | 'gdal_translate' | 'gdaladdo'
export type GdalCommandSource = 'bundled' | 'system'

export interface GdalRuntimePaths {
  binDirectory: string | null
  gdalDataDirectory: string | null
  projDirectory: string | null
  gdalPluginsDirectory: string | null
  libraryDirectory?: string | null
}

export interface GdalAvailability {
  available: boolean
  version?: string
  reason?: string
  runtimePaths: GdalRuntimePaths
  commandSource?: GdalCommandSource
}

export interface GdalCommandResult {
  command: string
  args: string[]
  stdout: string
  stderr: string
  durationMs: number
}

interface RunCommandOptions {
  cwd?: string
  timeoutMs?: number
}

export class GdalRunnerService {
  private availabilityCache: GdalAvailability | null = null
  private pendingAvailability: Promise<GdalAvailability> | null = null

  async getAvailability(forceRefresh = false): Promise<GdalAvailability> {
    if (forceRefresh) {
      this.availabilityCache = null
      this.pendingAvailability = null
    }

    if (this.availabilityCache) {
      return this.availabilityCache
    }

    if (!this.pendingAvailability) {
      this.pendingAvailability = this.resolveAvailability().finally(() => {
        this.pendingAvailability = null
      })
    }

    const availability = await this.pendingAvailability
    this.availabilityCache = availability
    return availability
  }

  async run(
    tool: GdalToolName,
    args: string[],
    options: RunCommandOptions = {}
  ): Promise<GdalCommandResult> {
    const availability = await this.getAvailability()
    if (!availability.available) {
      throw new Error(availability.reason || 'GDAL is not available')
    }

    const commandSource = availability.commandSource ?? 'bundled'
    const binDirectory = availability.runtimePaths.binDirectory
    if (commandSource === 'bundled' && !binDirectory) {
      throw new Error('Bundled GDAL binary directory is unavailable')
    }

    const command = resolveCommand(tool, binDirectory, process.platform, commandSource)
    return await this.spawnCommand({
      command,
      args,
      runtimePaths: availability.runtimePaths,
      commandSource,
      timeoutMs: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      cwd: options.cwd
    })
  }

  private async resolveAvailability(): Promise<GdalAvailability> {
    const runtimePaths = await resolveRuntimePaths()
    if (runtimePaths.binDirectory) {
      return await this.probeAvailability(runtimePaths, 'bundled')
    }

    const platformDirectoryHint = resolvePlatformDirectoryHint(process.platform)
    const missingBundledReason = `Bundled GDAL binaries were not found. Expected gdalinfo in resources/gdal/${platformDirectoryHint}/bin or resources/gdal/bin (or ARION_GDAL_BIN_DIR).`

    if (!allowsSystemGdalFallback(process.platform)) {
      return {
        available: false,
        reason: `${missingBundledReason} System GDAL fallback is only enabled on macOS and Linux.`,
        runtimePaths
      }
    }

    const systemAvailability = await this.probeAvailability(runtimePaths, 'system')
    if (systemAvailability.available) {
      return systemAvailability
    }

    const systemReason = systemAvailability.reason || 'Failed to execute gdalinfo from PATH'
    return {
      available: false,
      reason: `${missingBundledReason} System fallback failed: ${systemReason}`,
      runtimePaths,
      commandSource: 'system'
    }
  }

  private async probeAvailability(
    runtimePaths: GdalRuntimePaths,
    commandSource: GdalCommandSource
  ): Promise<GdalAvailability> {
    const command = resolveCommand(
      'gdalinfo',
      runtimePaths.binDirectory,
      process.platform,
      commandSource
    )

    try {
      const result = await this.spawnCommand({
        command,
        args: ['--version'],
        runtimePaths,
        commandSource,
        timeoutMs: AVAILABILITY_TIMEOUT_MS
      })
      const versionLine = firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr)
      return {
        available: true,
        version: versionLine ?? undefined,
        runtimePaths,
        commandSource
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to execute gdalinfo --version'
      return {
        available: false,
        reason,
        runtimePaths,
        commandSource
      }
    }
  }

  private async spawnCommand({
    command,
    args,
    runtimePaths,
    commandSource,
    timeoutMs,
    cwd
  }: {
    command: string
    args: string[]
    runtimePaths: GdalRuntimePaths
    commandSource: GdalCommandSource
    timeoutMs: number
    cwd?: string
  }): Promise<GdalCommandResult> {
    const environment = buildGdalEnvironment(runtimePaths, process.platform, commandSource)
    const startedAt = Date.now()

    return await new Promise<GdalCommandResult>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const child = spawn(command, args, {
        cwd,
        env: environment,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      const timeoutHandle = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })

      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })

      child.once('error', (error) => {
        clearTimeout(timeoutHandle)
        const message = error instanceof Error ? error.message : 'Unknown spawn error'
        reject(new Error(`Failed to start ${command}: ${message}`))
      })

      child.once('close', (code) => {
        clearTimeout(timeoutHandle)
        const durationMs = Date.now() - startedAt

        if (timedOut) {
          reject(new Error(`${command} timed out after ${timeoutMs}ms`))
          return
        }

        if (code !== 0) {
          const summary = summarizeCommandFailure(stderr, stdout)
          reject(
            new Error(`${command} exited with code ${code}${summary ? `: ${summary}` : ''}`.trim())
          )
          return
        }

        resolve({
          command,
          args,
          stdout,
          stderr,
          durationMs
        })
      })
    })
  }
}

function buildGdalEnvironment(
  runtimePaths: GdalRuntimePaths,
  platform: NodeJS.Platform = process.platform,
  commandSource: GdalCommandSource = 'bundled'
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  const pluginsDirectory = runtimePaths.gdalPluginsDirectory
  const disableBundledPlugins = process.env.ARION_GDAL_ENABLE_PLUGINS === '0'
  const usePluginDirectory =
    typeof pluginsDirectory === 'string' && pluginsDirectory.length > 0 && !disableBundledPlugins

  if (commandSource === 'bundled') {
    // Keep bundled GDAL execution isolated from host environment (e.g. Conda GDAL vars).
    delete env.GDAL_DRIVER_PATH
    delete env.GDAL_DATA
    delete env.PROJ_LIB
    delete env.CPL_CONFIG_FILE
    delete env.CPL_CONFIG_PATH
    env.PATH = prependPathEntry(runtimePaths.binDirectory, process.env.PATH)

    if (runtimePaths.gdalDataDirectory) {
      env.GDAL_DATA = runtimePaths.gdalDataDirectory
    }

    if (runtimePaths.projDirectory) {
      env.PROJ_LIB = runtimePaths.projDirectory
    }

    env.GDAL_DRIVER_PATH = usePluginDirectory ? pluginsDirectory : 'disable'
  } else {
    if (runtimePaths.binDirectory) {
      env.PATH = prependPathEntry(runtimePaths.binDirectory, process.env.PATH)
    }

    if (runtimePaths.gdalDataDirectory) {
      env.GDAL_DATA = runtimePaths.gdalDataDirectory
    }

    if (runtimePaths.projDirectory) {
      env.PROJ_LIB = runtimePaths.projDirectory
    }

    if (disableBundledPlugins) {
      env.GDAL_DRIVER_PATH = 'disable'
    } else if (usePluginDirectory) {
      env.GDAL_DRIVER_PATH = pluginsDirectory
    }
  }

  const libraryDirectory = runtimePaths.libraryDirectory
  if (libraryDirectory && platform === 'linux') {
    env.LD_LIBRARY_PATH = prependPathEntry(libraryDirectory, process.env.LD_LIBRARY_PATH)
  } else if (libraryDirectory && platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = prependPathEntry(libraryDirectory, process.env.DYLD_LIBRARY_PATH)
    env.DYLD_FALLBACK_LIBRARY_PATH = prependPathEntry(
      libraryDirectory,
      process.env.DYLD_FALLBACK_LIBRARY_PATH
    )
  }

  return env
}

async function resolveRuntimePaths(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): Promise<GdalRuntimePaths> {
  const configuredBinDirectory = normalizeOptionalPath(process.env.ARION_GDAL_BIN_DIR)
  const configuredGdalDataDirectory = normalizeOptionalPath(process.env.ARION_GDAL_DATA_DIR)
  const configuredProjDirectory = normalizeOptionalPath(process.env.ARION_PROJ_LIB_DIR)
  const configuredPluginsDirectory = normalizeOptionalPath(process.env.ARION_GDAL_PLUGINS_DIR)
  const configuredLibraryDirectory = normalizeOptionalPath(process.env.ARION_GDAL_LIBRARY_DIR)
  const resourcesPath = normalizeOptionalPath(process.resourcesPath)
  const appPath = getAppPathSafe()

  const rootCandidates = unique([
    normalizeOptionalPath(process.env.ARION_GDAL_HOME),
    joinIfBase(resourcesPath, 'gdal'),
    joinIfBase(appPath, 'resources', 'gdal'),
    joinIfBase(appPath, 'gdal'),
    normalizeOptionalPath(join(process.cwd(), 'resources', 'gdal'))
  ])
  const scopedRootCandidates = resolveScopedRootCandidates(rootCandidates, platform, arch)

  const bundledBinCandidates = unique([
    configuredBinDirectory,
    ...scopedRootCandidates.map((root) => join(root, 'bin')),
    ...scopedRootCandidates
  ])
  const bundledDataCandidates = unique([
    configuredGdalDataDirectory,
    ...scopedRootCandidates.map((root) => join(root, 'share', 'gdal'))
  ])
  const bundledProjCandidates = unique([
    configuredProjDirectory,
    ...scopedRootCandidates.map((root) => join(root, 'projlib')),
    ...scopedRootCandidates.map((root) => join(root, 'share', 'proj'))
  ])
  const bundledPluginsCandidates = unique([
    configuredPluginsDirectory,
    ...scopedRootCandidates.map((root) => join(root, 'gdalplugins')),
    ...scopedRootCandidates.map((root) => join(root, 'bin', 'gdalplugins')),
    ...scopedRootCandidates.map((root) => join(root, 'lib', 'gdalplugins')),
    ...scopedRootCandidates.map((root) => join(root, 'lib', 'gdal', 'plugins'))
  ])
  const bundledLibraryCandidates = unique([
    configuredLibraryDirectory,
    ...scopedRootCandidates.map((root) => join(root, 'lib')),
    ...scopedRootCandidates.map((root) => join(root, 'bin'))
  ])

  const binDirectory = await findDirectoryWithFile(
    bundledBinCandidates,
    `gdalinfo${resolveExecutableSuffix(platform)}`
  )
  const gdalDataDirectory = await findExistingDirectory(bundledDataCandidates)
  const projDirectory = await findExistingDirectory(bundledProjCandidates)
  const gdalPluginsDirectory = await findExistingDirectory(bundledPluginsCandidates)
  const libraryDirectory = await findExistingDirectory(bundledLibraryCandidates)

  return {
    binDirectory,
    gdalDataDirectory,
    projDirectory,
    gdalPluginsDirectory,
    libraryDirectory
  }
}

function resolveCommand(
  tool: GdalToolName,
  binDirectory: string | null,
  platform: NodeJS.Platform = process.platform,
  commandSource: GdalCommandSource = 'bundled'
): string {
  const executableName = `${tool}${resolveExecutableSuffix(platform)}`
  if (commandSource === 'system') {
    return executableName
  }

  if (!binDirectory) {
    throw new Error('Bundled GDAL binary directory is unavailable')
  }

  return join(binDirectory, executableName)
}

async function findDirectoryWithFile(
  candidates: string[],
  fileName: string
): Promise<string | null> {
  for (const directory of candidates) {
    if (await isFile(join(directory, fileName))) {
      return directory
    }
  }

  return null
}

async function findExistingDirectory(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      return candidate
    }
  }

  return null
}

async function isFile(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path)
    return stat.isFile()
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path)
    return stat.isDirectory()
  } catch {
    return false
  }
}

function resolveExecutableSuffix(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? '.exe' : ''
}

function resolvePlatformDirectoryHint(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'windows'
  }

  if (platform === 'darwin') {
    return 'macos'
  }

  if (platform === 'linux') {
    return 'linux'
  }

  return platform
}

function allowsSystemGdalFallback(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin' || platform === 'linux'
}

function resolvePlatformDirectoryNames(
  platform: NodeJS.Platform,
  arch: string = process.arch
): string[] {
  const normalizedArch = normalizeOptionalPath(arch)?.toLowerCase()
  const archScoped = normalizedArch
    ? unique([
        `${platform}-${normalizedArch}`,
        platform === 'win32' ? `windows-${normalizedArch}` : null,
        platform === 'darwin' ? `macos-${normalizedArch}` : null
      ])
    : []

  if (platform === 'win32') {
    return unique([...archScoped, 'windows', 'win32', 'win'])
  }

  if (platform === 'darwin') {
    return unique([...archScoped, 'macos', 'darwin', 'mac'])
  }

  if (platform === 'linux') {
    return unique([...archScoped, 'linux'])
  }

  return unique([...archScoped, platform])
}

function resolveScopedRootCandidates(
  rootCandidates: string[],
  platform: NodeJS.Platform,
  arch: string = process.arch
): string[] {
  const platformDirectoryNames = resolvePlatformDirectoryNames(platform, arch)
  const scopedRoots = rootCandidates.flatMap((root) =>
    platformDirectoryNames.map((directoryName) => join(root, directoryName))
  )

  return unique([...scopedRoots, ...rootCandidates])
}

function prependPathEntry(entry: string | null, existing: string | undefined): string {
  return unique([entry, ...splitPathEntries(existing)]).join(delimiter)
}

function splitPathEntries(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function unique(values: Array<string | null | undefined>): string[] {
  const deduped = new Set<string>()
  for (const value of values) {
    if (!value) {
      continue
    }

    deduped.add(value)
  }

  return Array.from(deduped.values())
}

function normalizeOptionalPath(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function joinIfBase(basePath: string | null, ...segments: string[]): string | null {
  if (!basePath) {
    return null
  }

  return join(basePath, ...segments)
}

function getAppPathSafe(): string | null {
  try {
    return app.getAppPath()
  } catch {
    return null
  }
}

function summarizeCommandFailure(stderr: string, stdout: string): string {
  const source = stderr.trim() || stdout.trim()
  if (!source) {
    return ''
  }

  const firstLine = firstNonEmptyLine(source) ?? source
  return firstLine.length > 300 ? `${firstLine.slice(0, 297)}...` : firstLine
}

function firstNonEmptyLine(value: string): string | null {
  const line = value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)

  return line ?? null
}

export const __testing = {
  allowsSystemGdalFallback,
  buildGdalEnvironment,
  prependPathEntry,
  resolveCommand,
  resolveExecutableSuffix,
  resolvePlatformDirectoryNames,
  resolveScopedRootCandidates
}

let gdalRunnerService: GdalRunnerService | null = null

export function getGdalRunnerService(): GdalRunnerService {
  if (!gdalRunnerService) {
    gdalRunnerService = new GdalRunnerService()
  }

  return gdalRunnerService
}
