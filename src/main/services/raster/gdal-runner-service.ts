import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { app } from 'electron'
import { join } from 'path'

const DEFAULT_COMMAND_TIMEOUT_MS = 2 * 60 * 1000
const AVAILABILITY_TIMEOUT_MS = 8 * 1000
const EXECUTABLE_SUFFIX = process.platform === 'win32' ? '.exe' : ''

export type GdalToolName = 'gdalinfo' | 'gdalwarp' | 'gdal_translate' | 'gdaladdo'

export interface GdalRuntimePaths {
  binDirectory: string | null
  gdalDataDirectory: string | null
  projDirectory: string | null
  gdalPluginsDirectory: string | null
}

export interface GdalAvailability {
  available: boolean
  version?: string
  reason?: string
  runtimePaths: GdalRuntimePaths
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

    const binDirectory = availability.runtimePaths.binDirectory
    if (!binDirectory) {
      throw new Error('Bundled GDAL binary directory is unavailable')
    }

    const command = resolveCommand(tool, binDirectory)
    return await this.spawnCommand({
      command,
      args,
      runtimePaths: availability.runtimePaths,
      timeoutMs: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      cwd: options.cwd
    })
  }

  private async resolveAvailability(): Promise<GdalAvailability> {
    const runtimePaths = await resolveRuntimePaths()
    if (!runtimePaths.binDirectory) {
      return {
        available: false,
        reason:
          'Bundled GDAL binaries were not found. Expected gdalinfo in resources/gdal/bin (or ARION_GDAL_BIN_DIR).',
        runtimePaths
      }
    }

    const command = resolveCommand('gdalinfo', runtimePaths.binDirectory)

    try {
      const result = await this.spawnCommand({
        command,
        args: ['--version'],
        runtimePaths,
        timeoutMs: AVAILABILITY_TIMEOUT_MS
      })
      const versionLine = firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr)

      return {
        available: true,
        version: versionLine ?? undefined,
        runtimePaths
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to execute gdalinfo --version'
      return {
        available: false,
        reason,
        runtimePaths
      }
    }
  }

  private async spawnCommand({
    command,
    args,
    runtimePaths,
    timeoutMs,
    cwd
  }: {
    command: string
    args: string[]
    runtimePaths: GdalRuntimePaths
    timeoutMs: number
    cwd?: string
  }): Promise<GdalCommandResult> {
    const environment = buildGdalEnvironment(runtimePaths)
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

function buildGdalEnvironment(runtimePaths: GdalRuntimePaths): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  // Keep GDAL execution isolated from host environment (e.g. Conda GDAL vars).
  delete env.GDAL_DRIVER_PATH
  delete env.GDAL_DATA
  delete env.PROJ_LIB
  delete env.CPL_CONFIG_FILE
  delete env.CPL_CONFIG_PATH

  env.PATH = runtimePaths.binDirectory ?? ''
  env.GDAL_DATA = runtimePaths.gdalDataDirectory ?? ''
  env.PROJ_LIB = runtimePaths.projDirectory ?? ''

  const useBundledPlugins =
    process.env.ARION_GDAL_ENABLE_PLUGINS === '1' &&
    typeof runtimePaths.gdalPluginsDirectory === 'string'
  env.GDAL_DRIVER_PATH = useBundledPlugins ? runtimePaths.gdalPluginsDirectory! : 'disable'

  return env
}

async function resolveRuntimePaths(): Promise<GdalRuntimePaths> {
  const configuredBinDirectory = normalizeOptionalPath(process.env.ARION_GDAL_BIN_DIR)
  const configuredGdalDataDirectory = normalizeOptionalPath(process.env.ARION_GDAL_DATA_DIR)
  const configuredProjDirectory = normalizeOptionalPath(process.env.ARION_PROJ_LIB_DIR)
  const configuredPluginsDirectory = normalizeOptionalPath(process.env.ARION_GDAL_PLUGINS_DIR)

  const rootCandidates = unique([
    normalizeOptionalPath(process.env.ARION_GDAL_HOME),
    normalizeOptionalPath(join(process.resourcesPath, 'gdal')),
    normalizeOptionalPath(join(getAppPathSafe() ?? '', 'resources', 'gdal')),
    normalizeOptionalPath(join(getAppPathSafe() ?? '', 'gdal')),
    normalizeOptionalPath(join(process.cwd(), 'resources', 'gdal'))
  ])

  const bundledBinCandidates = unique([
    configuredBinDirectory,
    ...rootCandidates,
    ...rootCandidates.map((root) => join(root, 'bin'))
  ])
  const bundledDataCandidates = unique([
    configuredGdalDataDirectory,
    ...rootCandidates.map((root) => join(root, 'share', 'gdal'))
  ])
  const bundledProjCandidates = unique([
    configuredProjDirectory,
    ...rootCandidates.map((root) => join(root, 'projlib')),
    ...rootCandidates.map((root) => join(root, 'share', 'proj'))
  ])
  const bundledPluginsCandidates = unique([
    configuredPluginsDirectory,
    ...rootCandidates.map((root) => join(root, 'gdalplugins')),
    ...rootCandidates.map((root) => join(root, 'bin', 'gdalplugins'))
  ])

  const binDirectory = await findDirectoryWithFile(
    bundledBinCandidates,
    `gdalinfo${EXECUTABLE_SUFFIX}`
  )
  const gdalDataDirectory = await findExistingDirectory(bundledDataCandidates)
  const projDirectory = await findExistingDirectory(bundledProjCandidates)
  const gdalPluginsDirectory = await findExistingDirectory(bundledPluginsCandidates)

  return {
    binDirectory,
    gdalDataDirectory,
    projDirectory,
    gdalPluginsDirectory
  }
}

function resolveCommand(tool: GdalToolName, binDirectory: string): string {
  const executableName = `${tool}${EXECUTABLE_SUFFIX}`
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

let gdalRunnerService: GdalRunnerService | null = null

export function getGdalRunnerService(): GdalRunnerService {
  if (!gdalRunnerService) {
    gdalRunnerService = new GdalRunnerService()
  }

  return gdalRunnerService
}
