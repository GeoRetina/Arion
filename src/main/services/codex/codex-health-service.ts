import { spawnSync } from 'child_process'
import type { CodexAuthState, CodexConfig, CodexHealthStatus } from '../../../shared/ipc-types'
import type { SettingsService } from '../settings-service'
import {
  formatCodexCliUpgradeMessage,
  isCodexCliVersionSupported,
  MINIMUM_CODEX_CLI_VERSION,
  parseCodexCliVersion
} from './codex-cli-version'

const DEFAULT_COMMAND_TIMEOUT_MS = 4_000

export interface CodexCommandResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

export interface CodexCommandRunner {
  run: (
    binaryPath: string,
    args: string[],
    options: { cwd?: string; homePath?: string | null; timeoutMs?: number }
  ) => CodexCommandResult
}

function defaultCommandRunner(): CodexCommandRunner {
  return {
    run(binaryPath, args, options) {
      const result = spawnSync(binaryPath, args, {
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...(options.homePath ? { CODEX_HOME: options.homePath } : {})
        },
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024
      })

      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        ...(result.error ? { error: result.error } : {})
      }
    }
  }
}

function normalizeOutput(stdout: string, stderr: string): string {
  return `${stdout}\n${stderr}`.trim()
}

function extractAuthBoolean(value: unknown): boolean | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractAuthBoolean(entry)
      if (nested !== undefined) {
        return nested
      }
    }
    return undefined
  }

  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>
  for (const key of ['authenticated', 'isAuthenticated', 'loggedIn', 'isLoggedIn'] as const) {
    if (typeof record[key] === 'boolean') {
      return record[key]
    }
  }

  for (const key of ['auth', 'status', 'session', 'account'] as const) {
    const nested = extractAuthBoolean(record[key])
    if (nested !== undefined) {
      return nested
    }
  }

  return undefined
}

function isMissingBinaryError(error: Error | undefined): boolean {
  if (!error) {
    return false
  }

  const lower = error.message.toLowerCase()
  return (
    lower.includes('enoent') ||
    lower.includes('command not found') ||
    lower.includes('not recognized') ||
    lower.includes('not found')
  )
}

export function parseCodexLoginStatus(
  output: string,
  status: number | null
): {
  authState: CodexAuthState
  message: string
} {
  const normalized = output.trim()
  const lower = normalized.toLowerCase()

  if (
    lower.includes('unknown command') ||
    lower.includes('unrecognized command') ||
    lower.includes('unexpected argument')
  ) {
    return {
      authState: 'unknown',
      message: 'Codex CLI authentication status command is unavailable in this Codex version.'
    }
  }

  if (
    lower.includes('not logged in') ||
    lower.includes('login required') ||
    lower.includes('authentication required') ||
    lower.includes('not authenticated') ||
    lower.includes('please login') ||
    lower.includes('run `codex login`') ||
    lower.includes('run codex login')
  ) {
    return {
      authState: 'unauthenticated',
      message: normalized || 'Codex CLI is not authenticated. Run `codex login` and try again.'
    }
  }

  if (lower.includes('logged in')) {
    return {
      authState: 'authenticated',
      message: normalized || 'Codex CLI is authenticated.'
    }
  }

  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    try {
      const parsedAuth = extractAuthBoolean(JSON.parse(normalized))
      if (parsedAuth === true) {
        return {
          authState: 'authenticated',
          message: normalized
        }
      }

      if (parsedAuth === false) {
        return {
          authState: 'unauthenticated',
          message: 'Codex CLI is not authenticated. Run `codex login` and try again.'
        }
      }

      return {
        authState: 'unknown',
        message: 'Could not verify Codex authentication status from JSON output.'
      }
    } catch {
      // Fall through to the exit-code-based fallback.
    }
  }

  if (status === 0) {
    return {
      authState: 'authenticated',
      message: normalized || 'Codex CLI is authenticated.'
    }
  }

  return {
    authState: 'unknown',
    message: normalized || 'Could not verify Codex authentication status.'
  }
}

export class CodexHealthService {
  private readonly commandRunner: CodexCommandRunner
  private readonly now: () => Date

  constructor(
    private readonly settingsService: SettingsService,
    options?: {
      commandRunner?: CodexCommandRunner
      now?: () => Date
    }
  ) {
    this.commandRunner = options?.commandRunner ?? defaultCommandRunner()
    this.now = options?.now ?? (() => new Date())
  }

  async getHealth(configOverride?: CodexConfig): Promise<CodexHealthStatus> {
    const config = configOverride ?? (await this.settingsService.getCodexConfig())
    const binaryPath = config.binaryPath || 'codex'
    const checkedAt = this.now().toISOString()

    const versionResult = this.commandRunner.run(binaryPath, ['--version'], {
      cwd: process.cwd(),
      homePath: config.homePath
    })
    const versionOutput = normalizeOutput(versionResult.stdout, versionResult.stderr)

    if (versionResult.error) {
      return {
        checkedAt,
        install: {
          state: isMissingBinaryError(versionResult.error) ? 'missing' : 'error',
          version: null,
          minimumSupportedVersion: MINIMUM_CODEX_CLI_VERSION,
          message: versionResult.error.message
        },
        authState: 'unknown',
        authMessage: 'Install Codex CLI and authenticate it before using this integration.',
        isReady: false
      }
    }

    if (versionResult.status !== 0) {
      return {
        checkedAt,
        install: {
          state: 'error',
          version: null,
          minimumSupportedVersion: MINIMUM_CODEX_CLI_VERSION,
          message:
            versionOutput ||
            `Codex version check exited with status ${String(versionResult.status)}.`
        },
        authState: 'unknown',
        authMessage: 'Codex CLI could not be validated.',
        isReady: false
      }
    }

    const version = parseCodexCliVersion(versionOutput)
    if (!version) {
      return {
        checkedAt,
        install: {
          state: 'error',
          version: null,
          minimumSupportedVersion: MINIMUM_CODEX_CLI_VERSION,
          message: 'Codex CLI responded, but Arion could not parse its version.'
        },
        authState: 'unknown',
        authMessage: 'Codex CLI version output was not recognized.',
        isReady: false
      }
    }

    if (!isCodexCliVersionSupported(version)) {
      return {
        checkedAt,
        install: {
          state: 'unsupported-version',
          version,
          minimumSupportedVersion: MINIMUM_CODEX_CLI_VERSION,
          message: formatCodexCliUpgradeMessage(version)
        },
        authState: 'unknown',
        authMessage: 'Upgrade Codex CLI before attempting a run.',
        isReady: false
      }
    }

    const loginResult = this.commandRunner.run(binaryPath, ['login', 'status'], {
      cwd: process.cwd(),
      homePath: config.homePath
    })
    const loginOutput = normalizeOutput(loginResult.stdout, loginResult.stderr)
    const auth = parseCodexLoginStatus(loginOutput, loginResult.status)

    return {
      checkedAt,
      install: {
        state: 'installed',
        version,
        minimumSupportedVersion: MINIMUM_CODEX_CLI_VERSION,
        message: `Codex CLI ${version} is installed.`
      },
      authState: auth.authState,
      authMessage: auth.message,
      isReady: auth.authState === 'authenticated'
    }
  }
}
