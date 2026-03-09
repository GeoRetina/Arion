import fs from 'fs'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process'
import readline from 'readline'
import { EventEmitter } from 'events'

type JsonRpcId = string | number

interface JsonRpcRequest {
  id: JsonRpcId
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  id: JsonRpcId
  result?: unknown
  error?: {
    code?: number
    message?: string
  }
}

interface JsonRpcNotification {
  method: string
  params?: unknown
}

interface PendingRequest {
  method: string
  timeout: ReturnType<typeof setTimeout>
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const REQUEST_TIMEOUT_MS = 20_000
const PROCESS_KILL_TIMEOUT_MS = 4_000
const ANSI_ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, 'g')
const CODEX_STDERR_LOG_REGEX =
  /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s+(.*)$/
const BENIGN_ERROR_LOG_SNIPPETS = [
  'state db missing rollout path for thread',
  'state db record_discrepancy: find_thread_path_by_id_str_in_subdir, falling_back'
]
const APPROVAL_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/fileRead/requestApproval'
])

function appendLogLine(filePath: string | undefined, line: string): void {
  if (!filePath) {
    return
  }

  try {
    fs.appendFileSync(filePath, `${line}\n`, 'utf8')
  } catch {
    void 0
  }
}

export function classifyCodexStderrLine(rawLine: string): { message: string } | null {
  const line = rawLine.replaceAll(ANSI_ESCAPE_REGEX, '').trim()
  if (!line) {
    return null
  }

  const match = line.match(CODEX_STDERR_LOG_REGEX)
  if (match) {
    const level = match[1]
    if (level && level !== 'ERROR') {
      return null
    }

    const lower = line.toLowerCase()
    const isBenignError = BENIGN_ERROR_LOG_SNIPPETS.some((snippet) => lower.includes(snippet))
    if (isBenignError) {
      return null
    }
  }

  return { message: line }
}

function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        timeout: PROCESS_KILL_TIMEOUT_MS
      })
      return
    } catch {
      // Fall through to the direct kill path.
    }
  }

  child.kill()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  const record = asRecord(value)
  return Boolean(
    record &&
    typeof record.method === 'string' &&
    (typeof record.id === 'string' || typeof record.id === 'number')
  )
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  const record = asRecord(value)
  return Boolean(record && typeof record.method === 'string' && !('id' in record))
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  const record = asRecord(value)
  return Boolean(
    record &&
    (typeof record.id === 'string' || typeof record.id === 'number') &&
    typeof record.method !== 'string'
  )
}

export interface CodexAppServerClientOptions {
  binaryPath: string
  cwd: string
  homePath?: string | null
  stdoutLogPath?: string
  stderrLogPath?: string
}

export interface CodexThreadStartResult {
  approvalPolicy?: unknown
  cwd?: string
  model?: string
  modelProvider?: string
  reasoningEffort?: string | null
  sandbox?: unknown
  thread: {
    id: string
    status?: unknown
    turns?: unknown[]
  }
}

export interface CodexTurnStartResult {
  turn: {
    id: string
    status: string
    items: unknown[]
    error?: {
      message?: string
      additionalDetails?: string | null
    } | null
  }
}

export type CodexApprovalResponseDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

export class CodexAppServerClient extends EventEmitter {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly output: readline.Interface
  private readonly pending = new Map<string, PendingRequest>()
  private nextRequestId = 1
  private closed = false

  constructor(private readonly options: CodexAppServerClientOptions) {
    super()

    this.child = spawn(options.binaryPath, ['app-server'], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.homePath ? { CODEX_HOME: options.homePath } : {})
      },
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.output = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity
    })

    this.output.on('line', (line) => {
      appendLogLine(this.options.stdoutLogPath, line)
      this.handleStdoutLine(line)
    })

    this.child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (!text) {
        return
      }

      text.split(/\r?\n/g).forEach((line) => {
        if (!line.trim()) {
          return
        }
        appendLogLine(this.options.stderrLogPath, line)
        const classified = classifyCodexStderrLine(line)
        if (!classified) {
          return
        }
        this.emit('stderr', classified.message)
      })
    })

    this.child.on('error', (error) => {
      this.emit('error', error)
      this.rejectAllPending(`Codex app-server process error: ${error.message}`)
    })

    this.child.on('exit', (code, signal) => {
      this.emit('exit', { code, signal })
      this.rejectAllPending(
        `Codex app-server exited before completing the request (code=${String(code)}, signal=${String(signal)}).`
      )
      this.closed = true
      this.output.close()
    })
  }

  async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      clientInfo: {
        name: 'arion',
        title: 'Arion',
        version: '0.4.8'
      },
      capabilities: {
        experimentalApi: true
      }
    })

    this.writeMessage({
      method: 'initialized'
    })
  }

  async startThread(params: {
    cwd: string
    model: string
    developerInstructions?: string
    approvalPolicy?: 'on-request' | 'never'
    sandbox?: 'workspace-write' | 'danger-full-access'
    ephemeral?: boolean
    serviceName?: string
    personality?: 'friendly' | 'pragmatic' | 'none'
  }): Promise<CodexThreadStartResult> {
    return this.sendRequest<CodexThreadStartResult>('thread/start', params)
  }

  async startTurn(params: {
    threadId: string
    cwd: string
    input: Array<{ type: 'text'; text: string }>
    model?: string | null
    effort?: string | null
    summary?: 'auto' | 'concise' | 'detailed' | 'none'
    approvalPolicy?: 'on-request' | 'never'
    sandboxPolicy?: {
      type: 'workspaceWrite'
      writableRoots?: string[]
      networkAccess?: boolean
      excludeSlashTmp?: boolean
      excludeTmpdirEnvVar?: boolean
    }
  }): Promise<CodexTurnStartResult> {
    return this.sendRequest<CodexTurnStartResult>('turn/start', params)
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.sendRequest('turn/interrupt', {
      threadId,
      turnId
    })
  }

  respondToApproval(
    requestId: string,
    method: string,
    decision: CodexApprovalResponseDecision
  ): void {
    if (this.closed) {
      throw new Error('Codex app-server session is already closed.')
    }

    if (!APPROVAL_METHODS.has(method)) {
      throw new Error(`Unsupported approval method: ${method}`)
    }

    this.writeMessage({
      id: Number.isNaN(Number(requestId)) ? requestId : Number(requestId),
      result: {
        decision
      }
    })
  }

  close(): void {
    if (this.closed) {
      return
    }

    this.closed = true
    this.rejectAllPending('Codex app-server session was closed.')
    this.output.close()

    if (!this.child.killed) {
      killChildTree(this.child)
    }
  }

  private handleStdoutLine(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      this.emit('error', new Error('Codex app-server emitted invalid JSON.'))
      return
    }

    if (isJsonRpcResponse(parsed)) {
      this.handleResponse(parsed)
      return
    }

    if (isJsonRpcNotification(parsed)) {
      this.emit('notification', parsed)
      return
    }

    if (isJsonRpcRequest(parsed)) {
      if (APPROVAL_METHODS.has(parsed.method)) {
        this.emit('approval-request', parsed)
        return
      }

      this.writeMessage({
        id: parsed.id,
        error: {
          code: -32601,
          message: `Unsupported server request: ${parsed.method}`
        }
      })
      this.emit(
        'error',
        new Error(`Codex app-server requested an unsupported action: ${parsed.method}`)
      )
      return
    }

    this.emit('error', new Error('Codex app-server emitted an unrecognized protocol message.'))
  }

  private handleResponse(response: JsonRpcResponse): void {
    const key = String(response.id)
    const pending = this.pending.get(key)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeout)
    this.pending.delete(key)

    if (response.error?.message) {
      pending.reject(new Error(`${pending.method} failed: ${response.error.message}`))
      return
    }

    pending.resolve(response.result)
  }

  private async sendRequest<TResponse>(method: string, params: unknown): Promise<TResponse> {
    if (this.closed) {
      throw new Error('Codex app-server session is already closed.')
    }

    const requestId = this.nextRequestId
    this.nextRequestId += 1

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(String(requestId))
        reject(new Error(`Timed out waiting for ${method}.`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(String(requestId), {
        method,
        timeout,
        resolve,
        reject
      })

      this.writeMessage({
        id: requestId,
        method,
        params
      })
    })

    return result as TResponse
  }

  private writeMessage(message: unknown): void {
    if (!this.child.stdin.writable) {
      throw new Error('Unable to write to Codex app-server stdin.')
    }

    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private rejectAllPending(message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }
}
