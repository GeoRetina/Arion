import { promises as fs } from 'fs'
import path from 'path'
import { ensureLocalFilesystemPath, isNetworkPath } from '../../security/path-security'
import type {
  QgisDiscoveredInstallation,
  QgisDiscoverySource,
  QgisIntegrationConfig
} from '../../../shared/ipc-types'
import type { QgisDiscoveryResult } from './types'
import { runQgisLauncherCommand } from './qgis-command-runner'

const DEFAULT_PROBE_TIMEOUT_MS = 8_000
const WINDOWS_PATH_SEPARATOR = /[\\/]/
const VERSION_PATTERN = /\b(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?)\b/

interface WindowsRegistryProbeResult {
  candidatePath: string
  source: QgisDiscoverySource
}

interface QgisDiscoveryServiceDeps {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  pathExists?: (candidatePath: string) => Promise<boolean>
  listDirectory?: (directoryPath: string) => Promise<string[]>
  queryWindowsRegistry?: () => Promise<WindowsRegistryProbeResult[]>
  which?: (commandName: string) => Promise<string[]>
}

export class QgisDiscoveryService {
  private readonly platform: NodeJS.Platform
  private readonly env: NodeJS.ProcessEnv
  private readonly pathExists: (candidatePath: string) => Promise<boolean>
  private readonly listDirectory: (directoryPath: string) => Promise<string[]>
  private readonly queryWindowsRegistry: () => Promise<WindowsRegistryProbeResult[]>
  private readonly which: (commandName: string) => Promise<string[]>

  constructor(deps: QgisDiscoveryServiceDeps = {}) {
    this.platform = deps.platform ?? process.platform
    this.env = deps.env ?? process.env
    this.pathExists = deps.pathExists ?? defaultPathExists
    this.listDirectory = deps.listDirectory ?? defaultListDirectory
    this.queryWindowsRegistry = deps.queryWindowsRegistry ?? queryWindowsRegistry
    this.which = deps.which ?? lookupCommandOnPath
  }

  public async discover(config?: QgisIntegrationConfig | null): Promise<QgisDiscoveryResult> {
    const diagnostics: string[] = []
    const installations: QgisDiscoveredInstallation[] = []
    const seenPaths = new Set<string>()

    const pushInstallation = async (
      candidatePath: string | undefined,
      source: QgisDiscoverySource
    ): Promise<void> => {
      if (!candidatePath) {
        return
      }

      const normalizedLauncherPath = await this.resolveCanonicalLauncherPath(candidatePath)
      if (!normalizedLauncherPath) {
        diagnostics.push(`No usable QGIS launcher found for ${source} candidate "${candidatePath}"`)
        return
      }

      const dedupeKey =
        this.platform === 'win32' ? normalizedLauncherPath.toLowerCase() : normalizedLauncherPath
      if (seenPaths.has(dedupeKey)) {
        return
      }

      seenPaths.add(dedupeKey)
      const installation = await this.probeLauncher(normalizedLauncherPath, source)
      if (installation) {
        installations.push(installation)
      }
    }

    const manualPath = config?.launcherPath?.trim()
    if (manualPath) {
      await pushInstallation(manualPath, 'manual')
      if ((config?.detectionMode ?? 'auto') === 'manual' && installations.length === 0) {
        return {
          status: 'invalid',
          installations: [],
          diagnostics:
            diagnostics.length > 0 ? diagnostics : ['Configured QGIS launcher is invalid']
        }
      }
    }

    const envOverride = this.env['ARION_QGIS_LAUNCHER']?.trim()
    if (envOverride) {
      await pushInstallation(envOverride, 'env')
    }

    if (this.platform === 'win32') {
      const registryCandidates = await this.queryWindowsRegistry()
      for (const candidate of registryCandidates) {
        await pushInstallation(candidate.candidatePath, candidate.source)
      }
    }

    for (const commonPathCandidate of await this.getCommonInstallCandidates()) {
      await pushInstallation(commonPathCandidate, 'common-path')
    }

    for (const pathCandidate of await this.getPathCandidates()) {
      await pushInstallation(pathCandidate, 'path')
    }

    if (installations.length === 0) {
      return {
        status: diagnostics.length > 0 ? 'invalid' : 'not-found',
        installations: [],
        diagnostics
      }
    }

    const preferredInstallation = selectPreferredInstallation(installations)
    return {
      status: installations.length > 1 ? 'multiple' : 'found',
      preferredInstallation,
      installations: installations.sort(compareInstallations),
      diagnostics
    }
  }

  private async resolveCanonicalLauncherPath(candidatePath: string): Promise<string | null> {
    let resolvedCandidatePath: string
    try {
      resolvedCandidatePath = ensureLocalFilesystemPath(candidatePath, 'QGIS launcher path')
    } catch {
      return null
    }

    if (isNetworkPath(resolvedCandidatePath)) {
      return null
    }

    if (!(await this.pathExists(resolvedCandidatePath))) {
      return null
    }

    const stats = await fs.stat(resolvedCandidatePath).catch(() => null)
    if (stats?.isFile()) {
      return await this.promoteCanonicalLauncher(resolvedCandidatePath)
    }

    if (!stats?.isDirectory()) {
      return null
    }

    for (const relativeLauncherPath of this.getRelativeLauncherCandidates()) {
      const candidateLauncherPath = path.join(resolvedCandidatePath, relativeLauncherPath)
      if (await this.pathExists(candidateLauncherPath)) {
        return candidateLauncherPath
      }
    }

    return null
  }

  private async promoteCanonicalLauncher(launcherPath: string): Promise<string> {
    if (
      this.platform !== 'win32' ||
      path.basename(launcherPath).toLowerCase() === 'qgis_process-qgis.bat'
    ) {
      return launcherPath
    }

    const pathSegments = launcherPath.split(WINDOWS_PATH_SEPARATOR)
    const binIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'bin')
    if (binIndex <= 0) {
      return launcherPath
    }

    const installRoot = pathSegments.slice(0, binIndex).join(path.sep)
    const preferredBatchLauncher = path.join(installRoot, 'bin', 'qgis_process-qgis.bat')
    return (await this.pathExists(preferredBatchLauncher)) ? preferredBatchLauncher : launcherPath
  }

  private async probeLauncher(
    launcherPath: string,
    source: QgisDiscoverySource
  ): Promise<QgisDiscoveredInstallation | null> {
    try {
      const result = await runQgisLauncherCommand({
        launcherPath,
        args: ['--version'],
        timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
        env: {
          ...process.env,
          QT_QPA_PLATFORM: this.env['QT_QPA_PLATFORM'] || 'offscreen'
        },
        platform: this.platform
      })

      if (result.exitCode !== 0) {
        return null
      }

      const versionText = `${result.stdout}\n${result.stderr}`
      return {
        launcherPath,
        installRoot: deriveInstallRoot(launcherPath, this.platform),
        version: extractQgisVersion(versionText),
        platform: this.platform,
        source,
        diagnostics: compactStrings([
          firstNonEmptyLine(result.stdout),
          firstNonEmptyLine(result.stderr)
        ])
      }
    } catch {
      return null
    }
  }

  private async getCommonInstallCandidates(): Promise<string[]> {
    if (this.platform === 'win32') {
      const candidates = new Set<string>()
      for (const programFilesPath of compactStrings([
        this.env['ProgramFiles'],
        this.env['ProgramW6432'],
        this.env['ProgramFiles(x86)']
      ])) {
        for (const entry of await this.listDirectory(programFilesPath)) {
          if (/^QGIS/i.test(entry)) {
            candidates.add(path.join(programFilesPath, entry))
          }
        }
      }

      for (const osgeoRoot of ['C:\\OSGeo4W', 'C:\\OSGeo4W64']) {
        if (await this.pathExists(osgeoRoot)) {
          candidates.add(osgeoRoot)
        }
      }

      return Array.from(candidates.values())
    }

    if (this.platform === 'darwin') {
      return ['/Applications/QGIS.app']
    }

    return ['/usr', '/usr/local', '/opt/qgis']
  }

  private async getPathCandidates(): Promise<string[]> {
    const commands =
      this.platform === 'win32'
        ? ['qgis_process-qgis.bat', 'qgis_process.exe', 'qgis_process']
        : ['qgis_process']

    const results = new Set<string>()
    for (const commandName of commands) {
      for (const candidatePath of await this.which(commandName)) {
        results.add(candidatePath)
      }
    }

    return Array.from(results.values())
  }

  private getRelativeLauncherCandidates(): string[] {
    if (this.platform === 'win32') {
      return [
        path.join('bin', 'qgis_process-qgis.bat'),
        path.join('bin', 'qgis_process.bat'),
        path.join('bin', 'qgis_process.exe'),
        path.join('apps', 'qgis', 'bin', 'qgis_process.exe'),
        path.join('apps', 'qgis-ltr', 'bin', 'qgis_process.exe')
      ]
    }

    if (this.platform === 'darwin') {
      return [path.join('Contents', 'MacOS', 'bin', 'qgis_process')]
    }

    return [path.join('bin', 'qgis_process')]
  }
}

async function defaultPathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
}

async function defaultListDirectory(directoryPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

async function queryWindowsRegistry(): Promise<WindowsRegistryProbeResult[]> {
  const candidates = await Promise.all([
    queryRegistryAppPath(
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\qgis_process.exe'
    ),
    queryRegistryAppPath(
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\qgis_process.exe'
    ),
    queryRegistryUninstallRoots('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'),
    queryRegistryUninstallRoots(
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    )
  ])

  return candidates.flat()
}

async function queryRegistryAppPath(registryKey: string): Promise<WindowsRegistryProbeResult[]> {
  const stdout = await runWindowsRegistryQuery(['query', registryKey, '/ve']).catch(() => '')
  const match = stdout.match(/REG_\w+\s+([^\r\n]+)$/m)
  if (!match?.[1]) {
    return []
  }

  return [
    {
      candidatePath: match[1].trim(),
      source: 'registry'
    }
  ]
}

async function queryRegistryUninstallRoots(
  registryRoot: string
): Promise<WindowsRegistryProbeResult[]> {
  const stdout = await runWindowsRegistryQuery(['query', registryRoot, '/s', '/f', 'QGIS']).catch(
    () => ''
  )
  if (!stdout) {
    return []
  }

  const candidates = new Set<string>()
  const lines = stdout.split(/\r?\n/u)
  for (const line of lines) {
    const trimmedLine = line.trim()
    const installLocationMatch = trimmedLine.match(/^InstallLocation\s+REG_\w+\s+(.+)$/i)
    if (installLocationMatch?.[1]) {
      candidates.add(installLocationMatch[1].trim())
      continue
    }

    const displayIconMatch = trimmedLine.match(/^DisplayIcon\s+REG_\w+\s+(.+)$/i)
    if (displayIconMatch?.[1]) {
      candidates.add(displayIconMatch[1].trim().replace(/,\d+$/, ''))
    }
  }

  return Array.from(candidates.values()).map((candidatePath) => ({
    candidatePath,
    source: 'registry'
  }))
}

async function runWindowsRegistryQuery(args: string[]): Promise<string> {
  const result = await runQgisLauncherCommand({
    launcherPath: 'reg',
    args,
    timeoutMs: 5_000,
    platform: 'win32'
  })
  return result.stdout
}

async function lookupCommandOnPath(commandName: string): Promise<string[]> {
  const launcherPath = process.platform === 'win32' ? 'where' : 'which'
  const args = process.platform === 'win32' ? [commandName] : ['-a', commandName]

  try {
    const result = await runQgisLauncherCommand({
      launcherPath,
      args,
      timeoutMs: 3_000
    })

    return compactStrings(result.stdout.split(/\r?\n/u))
  } catch {
    return []
  }
}

function selectPreferredInstallation(
  installations: QgisDiscoveredInstallation[]
): QgisDiscoveredInstallation {
  return [...installations].sort(compareInstallations)[0]
}

function compareInstallations(
  left: QgisDiscoveredInstallation,
  right: QgisDiscoveredInstallation
): number {
  const sourcePriorityLeft = getSourcePriority(left.source)
  const sourcePriorityRight = getSourcePriority(right.source)
  if (sourcePriorityLeft !== sourcePriorityRight) {
    return sourcePriorityLeft - sourcePriorityRight
  }

  const versionComparison = compareVersionStrings(right.version, left.version)
  if (versionComparison !== 0) {
    return versionComparison
  }

  return left.launcherPath.localeCompare(right.launcherPath)
}

function getSourcePriority(source: QgisDiscoverySource): number {
  switch (source) {
    case 'manual':
      return 0
    case 'env':
      return 1
    case 'registry':
      return 2
    case 'common-path':
      return 3
    case 'path':
      return 4
  }
}

function compareVersionStrings(left?: string, right?: string): number {
  const leftParts = normalizeVersion(left)
  const rightParts = normalizeVersion(right)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}

function normalizeVersion(version?: string): number[] {
  if (!version) {
    return []
  }

  return version
    .split(/[^\d]+/u)
    .filter((value) => value.length > 0)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

function deriveInstallRoot(launcherPath: string, platform: NodeJS.Platform): string | undefined {
  if (platform === 'darwin') {
    const appIndex = launcherPath.indexOf('.app')
    if (appIndex > 0) {
      return launcherPath.slice(0, appIndex + 4)
    }
  }

  const segments = launcherPath.split(WINDOWS_PATH_SEPARATOR)
  const binIndex = segments.findIndex((segment) => segment.toLowerCase() === 'bin')
  if (binIndex <= 0) {
    return path.dirname(launcherPath)
  }

  return segments.slice(0, binIndex).join(path.sep)
}

function extractQgisVersion(output: string): string | undefined {
  const versionMatch = output.match(VERSION_PATTERN)
  return versionMatch?.[1]
}

function firstNonEmptyLine(value: string): string | null {
  return (
    value
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? null
  )
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}
