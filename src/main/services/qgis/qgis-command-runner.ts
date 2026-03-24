import { spawn } from 'child_process'

export interface QgisCommandRunnerRequest {
  launcherPath: string
  args: string[]
  cwd?: string
  timeoutMs: number
  stdin?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export interface QgisCommandRunnerResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export async function runQgisLauncherCommand(
  request: QgisCommandRunnerRequest
): Promise<QgisCommandRunnerResult> {
  const platform = request.platform ?? process.platform
  const useWindowsBatchLauncher =
    platform === 'win32' && request.launcherPath.toLowerCase().endsWith('.bat')
  const startedAt = Date.now()

  return await new Promise<QgisCommandRunnerResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const child = useWindowsBatchLauncher
      ? spawn(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', buildWindowsBatchCommand(request.launcherPath, request.args)],
          {
            cwd: request.cwd,
            env: request.env,
            windowsHide: true,
            windowsVerbatimArguments: true,
            stdio: ['pipe', 'pipe', 'pipe']
          }
        )
      : spawn(request.launcherPath, request.args, {
          cwd: request.cwd,
          env: request.env,
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        })

    const timeoutHandle = setTimeout(() => {
      timedOut = true
      void killChildProcessTree(child.pid, platform)
    }, request.timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.once('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutHandle)
      reject(
        new Error(
          `Failed to start QGIS launcher "${request.launcherPath}": ${error instanceof Error ? error.message : String(error)}`
        )
      )
    })

    child.once('close', (exitCode) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutHandle)
      const durationMs = Date.now() - startedAt

      if (timedOut) {
        reject(new Error(`QGIS launcher timed out after ${request.timeoutMs}ms`))
        return
      }

      resolve({
        stdout,
        stderr,
        exitCode: typeof exitCode === 'number' ? exitCode : -1,
        durationMs
      })
    })

    if (typeof request.stdin === 'string' && child.stdin) {
      child.stdin.write(request.stdin, 'utf8')
    }
    child.stdin?.end()
  })
}

function buildWindowsBatchCommand(launcherPath: string, args: string[]): string {
  const escapedLauncherPath = escapeWindowsBatchArgumentContent(launcherPath)
  const escapedArgs = args.map(quoteWindowsBatchArgument).join(' ')
  return escapedArgs.length > 0
    ? `""${escapedLauncherPath}" ${escapedArgs}"`
    : `""${escapedLauncherPath}""`
}

function quoteWindowsBatchArgument(value: string): string {
  return `"${escapeWindowsBatchArgumentContent(value)}"`
}

function escapeWindowsBatchArgumentContent(value: string): string {
  return value.replace(/"/g, '""')
}

async function killChildProcessTree(
  pid: number | undefined,
  platform: NodeJS.Platform
): Promise<void> {
  if (!pid) {
    return
  }

  if (platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore'
      })

      killer.once('error', () => resolve())
      killer.once('close', () => resolve())
    })
    return
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Ignore cleanup failures during timeout handling.
  }
}
