import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import type { McpServerConfig } from '../../../shared/ipc-types'

const BUNDLED_MCP_SERVERS_DIRNAME = 'mcp-servers'
const BUNDLED_MCP_ID_PREFIX = 'bundled-mcp:'

export const BUNDLED_MCP_SERVER_IDS_KEY = 'bundledMcpServerIds'

export interface BundledMcpServerEnvironment {
  getAppPath?: () => string
  getResourcesPath?: () => string
  getCwd?: () => string
  platform?: NodeJS.Platform
  commandExists?: (command: string) => boolean
  resolvePythonExecutable?: (command: string) => string | null
}

export type BundledMcpServerSeed = Pick<
  McpServerConfig,
  'id' | 'name' | 'command' | 'args' | 'enabled'
> & {
  legacyName: string
}

const safeReadPath = (getter?: () => string): string | null => {
  if (!getter) {
    return null
  }

  try {
    const value = getter()
    return typeof value === 'string' && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

const defaultCommandExists = (command: string): boolean => {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    windowsHide: true
  })

  return !result.error && result.status === 0
}

const defaultResolvePythonExecutable = (command: string): string | null => {
  const result = spawnSync(
    command,
    ['-c', 'import os, sys; print(os.path.realpath(sys.executable))'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 3_000
    }
  )

  if (result.error || result.status !== 0) {
    return null
  }

  const executablePath = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!executablePath || !path.isAbsolute(executablePath)) {
    return null
  }

  return path.normalize(executablePath)
}

const getPythonCommandCandidates = (platform: NodeJS.Platform): string[] => {
  if (platform === 'win32') {
    return ['py', 'python', 'python3']
  }

  return ['python3', 'python']
}

const humanizeSegment = (segment: string): string => {
  return segment
    .replace(/\.py$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const normalizeBundledMcpRelativePath = (relativeScriptPath: string): string => {
  return relativeScriptPath.replace(/\\/g, '/')
}

export const getBundledMcpLegacyName = (relativeScriptPath: string): string => {
  return normalizeBundledMcpRelativePath(relativeScriptPath)
    .split('/')
    .map((segment) => humanizeSegment(segment))
    .join(' / ')
}

export const getBundledMcpDisplayName = (relativeScriptPath: string): string => {
  const normalizedRelativePath = normalizeBundledMcpRelativePath(relativeScriptPath)
  const scriptName = normalizedRelativePath.split('/').at(-1) ?? normalizedRelativePath
  return humanizeSegment(scriptName)
}

export const shouldRefreshBundledMcpServerName = (
  currentName: string,
  server: Pick<BundledMcpServerSeed, 'name' | 'legacyName'>
): boolean => {
  const normalizedCurrentName = currentName.trim()
  return normalizedCurrentName.length === 0 || normalizedCurrentName === server.legacyName
}

const listPythonScripts = (rootDir: string): string[] => {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  const scripts: string[] = []

  for (const entry of entries) {
    if (entry.name === '__pycache__') {
      continue
    }

    const fullPath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      scripts.push(...listPythonScripts(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.py')) {
      scripts.push(fullPath)
    }
  }

  return scripts
}

export const resolveDefaultPythonCommand = (
  environment: BundledMcpServerEnvironment = {}
): string => {
  const platform = environment.platform ?? process.platform
  const resolvePythonExecutable =
    environment.resolvePythonExecutable ?? defaultResolvePythonExecutable
  const commandExists = environment.commandExists ?? defaultCommandExists
  const candidates = getPythonCommandCandidates(platform)
  let fallbackCommand: string | null = null

  for (const candidate of candidates) {
    const resolvedExecutable = resolvePythonExecutable(candidate)
    if (resolvedExecutable) {
      return resolvedExecutable
    }

    if (!fallbackCommand && commandExists(candidate)) {
      fallbackCommand = candidate
    }
  }

  return fallbackCommand ?? candidates[0] ?? 'python'
}

export const shouldRefreshBundledMcpCommand = (
  currentCommand: string | null | undefined,
  environment: Pick<BundledMcpServerEnvironment, 'platform'>
): boolean => {
  const normalizedCurrentCommand = currentCommand?.trim()
  if (!normalizedCurrentCommand) {
    return true
  }

  const platform = environment.platform ?? process.platform
  const genericCandidates = getPythonCommandCandidates(platform)
  const genericCommandSet =
    platform === 'win32'
      ? new Set(
          genericCandidates.flatMap((candidate) => [candidate.toLowerCase(), `${candidate}.exe`])
        )
      : new Set(genericCandidates)

  return genericCommandSet.has(
    platform === 'win32' ? normalizedCurrentCommand.toLowerCase() : normalizedCurrentCommand
  )
}

export const resolveBundledMcpServersRoot = (
  environment: BundledMcpServerEnvironment = {}
): string | null => {
  const resourcesPath = safeReadPath(environment.getResourcesPath)
  const appPath = safeReadPath(environment.getAppPath)
  const cwd = safeReadPath(environment.getCwd)
  const candidates = new Set<string>()

  if (resourcesPath) {
    candidates.add(path.resolve(resourcesPath, BUNDLED_MCP_SERVERS_DIRNAME))
  }

  if (appPath) {
    candidates.add(path.resolve(appPath, BUNDLED_MCP_SERVERS_DIRNAME))
    candidates.add(path.resolve(appPath, '..', BUNDLED_MCP_SERVERS_DIRNAME))
    candidates.add(path.resolve(appPath, '..', '..', BUNDLED_MCP_SERVERS_DIRNAME))

    if (appPath.toLowerCase().endsWith('.asar')) {
      candidates.add(path.resolve(appPath, '..', BUNDLED_MCP_SERVERS_DIRNAME))
    }
  }

  if (cwd) {
    candidates.add(path.resolve(cwd, BUNDLED_MCP_SERVERS_DIRNAME))
  }

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate
      }
    } catch {
      continue
    }
  }

  return null
}

export const discoverBundledMcpServers = (
  environment: BundledMcpServerEnvironment = {}
): BundledMcpServerSeed[] => {
  const rootDir = resolveBundledMcpServersRoot(environment)
  if (!rootDir) {
    return []
  }

  const pythonCommand = resolveDefaultPythonCommand(environment)
  const scripts = listPythonScripts(rootDir).sort((left, right) => left.localeCompare(right))

  return scripts.map((scriptPath) => {
    const relativeScriptPath = path.relative(rootDir, scriptPath)
    const normalizedRelativePath = normalizeBundledMcpRelativePath(relativeScriptPath)
    const legacyName = getBundledMcpLegacyName(normalizedRelativePath)
    const name = getBundledMcpDisplayName(normalizedRelativePath)

    return {
      id: `${BUNDLED_MCP_ID_PREFIX}${normalizedRelativePath}`,
      name,
      legacyName,
      command: pythonCommand,
      args: [scriptPath],
      enabled: false
    }
  })
}
