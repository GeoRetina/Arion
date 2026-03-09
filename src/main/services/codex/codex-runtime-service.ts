import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
  CodexConfig,
  CodexHealthStatus,
  CodexRunArtifact,
  CodexRunRecord,
  CodexRunRequest,
  CodexRunResult,
  CodexRunStatus,
  CodexRuntimeEvent,
  CodexStagedInput
} from '../../../shared/ipc-types'
import type { SettingsService } from '../settings-service'
import { CodexArtifactService } from './codex-artifact-service'
import { CodexAppServerClient, type CodexApprovalResponseDecision } from './codex-app-server-client'
import { CodexHealthService } from './codex-health-service'
import { CodexRunWorkspaceService } from './codex-run-workspace-service'
import { mapCodexNotificationToRuntimeEvent, mapCodexRequestToApproval } from './codex-event-mapper'

const DEFAULT_RUN_TIMEOUT_MS = 15 * 60 * 1000
const CODEX_DEFAULT_MODEL = 'gpt-5.3-codex'
const CODEX_SYSTEM_INSTRUCTIONS = [
  'You are Codex running inside Arion, a desktop app for geospatial analysis.',
  'Respect the workspace boundaries defined by the current working directory.',
  'Read staged context from `inputs/` and write generated artifacts only to `outputs/`.',
  'Prefer concise commentary and a concise final answer.',
  'Favor standard, reviewable artifacts such as Markdown, GeoJSON, CSV, PNG, Python, and SQL.'
].join(' ')

interface DeferredCompletion {
  promise: Promise<{
    status: 'completed' | 'failed' | 'cancelled'
    error?: string | null
  }>
  resolve: (value: { status: 'completed' | 'failed' | 'cancelled'; error?: string | null }) => void
}

interface ActiveApprovalBinding {
  requestId: string
  method: string
  createdAt: string
}

interface ActiveCodexRun {
  run: CodexRunResult
  client: CodexAppServerClient
  threadId: string | null
  turnId: string | null
  completion: DeferredCompletion
  timeout: ReturnType<typeof setTimeout> | null
  approvals: Map<string, ActiveApprovalBinding>
  summaryMessages: string[]
  finalMessages: string[]
  approvalsLogPath: string
  eventsLogPath: string
}

interface CodexRunManifest {
  runId: string
  chatId: string
  goal: string
  model: string
  reasoningEffort: string
  status: CodexRunStatus
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  workspacePath: string
  inputsPath: string
  outputsPath: string
  logsPath: string
  manifestPath: string
  summary?: string | null
  error?: string | null
  artifacts: CodexRunArtifact[]
  stagedInputs: CodexStagedInput[]
}

function createDeferredCompletion(): DeferredCompletion {
  let resolve!: DeferredCompletion['resolve']
  const promise = new Promise<{
    status: 'completed' | 'failed' | 'cancelled'
    error?: string | null
  }>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function cloneRunRecord(run: CodexRunResult): CodexRunResult {
  return structuredClone(run)
}

function toRecord(run: CodexRunResult): CodexRunRecord {
  const record = structuredClone(run) as Partial<CodexRunResult>
  delete record.stagedInputs
  return record as CodexRunRecord
}

function appendJsonLine(filePath: string, value: unknown): void {
  try {
    fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8')
  } catch {
    void 0
  }
}

export class CodexRuntimeService extends EventEmitter {
  private readonly runs = new Map<string, CodexRunResult>()
  private readonly activeRuns = new Map<string, ActiveCodexRun>()
  private readonly healthService: CodexHealthService
  private readonly artifactService: CodexArtifactService
  private readonly workspaceService: CodexRunWorkspaceService

  constructor(
    private readonly settingsService: SettingsService,
    options?: {
      healthService?: CodexHealthService
      artifactService?: CodexArtifactService
      workspaceService?: CodexRunWorkspaceService
    }
  ) {
    super()
    this.healthService = options?.healthService ?? new CodexHealthService(this.settingsService)
    this.artifactService = options?.artifactService ?? new CodexArtifactService()
    this.workspaceService = options?.workspaceService ?? new CodexRunWorkspaceService()
  }

  async getHealth(configOverride?: CodexConfig): Promise<CodexHealthStatus> {
    const health = await this.healthService.getHealth(configOverride)
    this.emit('health-updated', health)
    return health
  }

  async startRun(request: CodexRunRequest): Promise<CodexRunResult> {
    const config = await this.settingsService.getCodexConfig()
    const health = await this.healthService.getHealth(config)
    if (!health.isReady) {
      throw new Error(
        `${health.install.message} ${health.authMessage}`.trim() ||
          'Codex CLI is not ready for runs.'
      )
    }

    const runId = randomUUID()
    const preparedWorkspace = await this.workspaceService.prepareRun(runId, request)
    const now = new Date().toISOString()
    const model = request.model || config.defaultModel || CODEX_DEFAULT_MODEL
    const reasoningEffort = request.reasoningEffort || config.reasoningEffort || 'medium'

    const run: CodexRunResult = {
      runId,
      chatId: request.chatId,
      status: 'starting',
      goal: request.goal,
      model,
      reasoningEffort,
      workspacePath: preparedWorkspace.workspacePath,
      inputsPath: preparedWorkspace.inputsPath,
      outputsPath: preparedWorkspace.outputsPath,
      logsPath: preparedWorkspace.logsPath,
      manifestPath: preparedWorkspace.manifestPath,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      summary: null,
      error: null,
      artifacts: [],
      stagedInputs: preparedWorkspace.stagedInputs
    }

    const eventsLogPath = path.join(preparedWorkspace.logsPath, 'events.ndjson')
    const approvalsLogPath = path.join(preparedWorkspace.logsPath, 'approvals.ndjson')
    const client = new CodexAppServerClient({
      binaryPath: config.binaryPath || 'codex',
      homePath: config.homePath,
      cwd: preparedWorkspace.workspacePath,
      stdoutLogPath: path.join(preparedWorkspace.logsPath, 'codex.stdout.log'),
      stderrLogPath: path.join(preparedWorkspace.logsPath, 'codex.stderr.log')
    })
    const completion = createDeferredCompletion()
    const activeRun: ActiveCodexRun = {
      run,
      client,
      threadId: null,
      turnId: null,
      completion,
      timeout: null,
      approvals: new Map<string, ActiveApprovalBinding>(),
      summaryMessages: [],
      finalMessages: [],
      approvalsLogPath,
      eventsLogPath
    }

    this.runs.set(runId, run)
    this.activeRuns.set(runId, activeRun)
    await this.writeManifest(activeRun)
    this.emitRunEvent(activeRun, {
      eventId: randomUUID(),
      runId,
      chatId: request.chatId,
      type: 'status',
      createdAt: now,
      status: 'starting',
      message: 'Starting Codex run.'
    })

    client.on('notification', (notification: unknown) => {
      this.handleNotification(activeRun, notification)
    })
    client.on('approval-request', (requestMessage: unknown) => {
      void this.handleApprovalRequest(activeRun, requestMessage)
    })
    client.on('stderr', (line: string) => {
      this.emitRunEvent(activeRun, {
        eventId: randomUUID(),
        runId,
        chatId: request.chatId,
        type: 'error',
        createdAt: new Date().toISOString(),
        status: activeRun.run.status,
        message: line
      })
    })
    client.on('error', (error: Error) => {
      this.failRun(activeRun, error.message)
    })
    client.on('exit', () => {
      if (activeRun.run.status === 'cancelled') {
        this.resolveCompletion(activeRun, {
          status: 'cancelled',
          error: activeRun.run.error
        })
        return
      }

      if (activeRun.run.status !== 'completed' && activeRun.run.status !== 'failed') {
        this.failRun(activeRun, 'Codex app-server exited before the run completed.')
      }
    })

    activeRun.timeout = setTimeout(() => {
      void this.cancelRun(runId)
      this.failRun(activeRun, 'Codex run timed out before completion.')
    }, DEFAULT_RUN_TIMEOUT_MS)

    try {
      await client.initialize()
      const thread = await client.startThread({
        cwd: preparedWorkspace.workspacePath,
        model: run.model,
        developerInstructions: CODEX_SYSTEM_INSTRUCTIONS,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        ephemeral: true,
        serviceName: 'Arion',
        personality: 'pragmatic'
      })
      activeRun.threadId = thread.thread.id

      await this.updateRunStatus(activeRun, 'running')

      const turn = await client.startTurn({
        threadId: thread.thread.id,
        cwd: preparedWorkspace.workspacePath,
        input: [{ type: 'text', text: preparedWorkspace.prompt }],
        model: run.model,
        effort: reasoningEffort,
        summary: 'concise',
        approvalPolicy: 'on-request',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [preparedWorkspace.workspacePath],
          networkAccess: false,
          excludeSlashTmp: false,
          excludeTmpdirEnvVar: false
        }
      })
      activeRun.turnId = turn.turn.id

      const completionResult = await completion.promise
      await this.finalizeRun(activeRun, completionResult)
      return cloneRunRecord(activeRun.run)
    } catch (error) {
      this.failRun(
        activeRun,
        error instanceof Error ? error.message : 'Codex run failed unexpectedly.'
      )
      await this.finalizeRun(activeRun, {
        status: activeRun.run.status === 'cancelled' ? 'cancelled' : 'failed',
        error: activeRun.run.error
      })
      return cloneRunRecord(activeRun.run)
    } finally {
      if (activeRun.timeout) {
        clearTimeout(activeRun.timeout)
        activeRun.timeout = null
      }
      client.close()
      this.activeRuns.delete(runId)
    }
  }

  async cancelRun(runId: string): Promise<boolean> {
    const activeRun = this.activeRuns.get(runId)
    if (!activeRun) {
      return false
    }

    activeRun.run.status = 'cancelled'
    activeRun.run.updatedAt = new Date().toISOString()
    activeRun.run.error = activeRun.run.error || 'Run cancelled by the user.'
    await this.writeManifest(activeRun)
    this.emitRunEvent(activeRun, {
      eventId: randomUUID(),
      runId: activeRun.run.runId,
      chatId: activeRun.run.chatId,
      type: 'status',
      createdAt: new Date().toISOString(),
      status: 'cancelled',
      message: 'Cancelling Codex run.'
    })

    try {
      if (activeRun.threadId && activeRun.turnId) {
        await activeRun.client.interruptTurn(activeRun.threadId, activeRun.turnId)
      }
    } catch {
      // If interrupt fails, closing the client still stops the run.
    }

    activeRun.client.close()
    this.resolveCompletion(activeRun, {
      status: 'cancelled',
      error: activeRun.run.error
    })
    return true
  }

  getRun(runId: string): CodexRunResult | null {
    const run = this.runs.get(runId)
    return run ? cloneRunRecord(run) : null
  }

  listRuns(chatId?: string): CodexRunRecord[] {
    return Array.from(this.runs.values())
      .filter((run) => (chatId ? run.chatId === chatId : true))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .map((run) => toRecord(run))
  }

  async approveRequest(decision: CodexApprovalDecision): Promise<void> {
    const resolved = this.findApproval(decision.approvalId)
    if (!resolved) {
      throw new Error(`Unknown Codex approval request: ${decision.approvalId}`)
    }

    const providerDecision: CodexApprovalResponseDecision =
      decision.scope === 'run' ? 'acceptForSession' : 'accept'
    resolved.activeRun.client.respondToApproval(
      resolved.binding.requestId,
      resolved.binding.method,
      providerDecision
    )
    resolved.activeRun.approvals.delete(decision.approvalId)
    appendJsonLine(resolved.activeRun.approvalsLogPath, {
      approvalId: decision.approvalId,
      requestId: resolved.binding.requestId,
      method: resolved.binding.method,
      decision: providerDecision,
      decidedAt: new Date().toISOString()
    })
    await this.updateRunStatus(resolved.activeRun, 'running')
  }

  async denyRequest(approvalId: string): Promise<void> {
    const resolved = this.findApproval(approvalId)
    if (!resolved) {
      throw new Error(`Unknown Codex approval request: ${approvalId}`)
    }

    resolved.activeRun.client.respondToApproval(
      resolved.binding.requestId,
      resolved.binding.method,
      'decline'
    )
    resolved.activeRun.approvals.delete(approvalId)
    appendJsonLine(resolved.activeRun.approvalsLogPath, {
      approvalId,
      requestId: resolved.binding.requestId,
      method: resolved.binding.method,
      decision: 'decline',
      decidedAt: new Date().toISOString()
    })
    await this.updateRunStatus(resolved.activeRun, 'running')
  }

  shutdown(): void {
    for (const activeRun of this.activeRuns.values()) {
      activeRun.client.close()
    }
    this.activeRuns.clear()
  }

  private findApproval(approvalId: string): {
    activeRun: ActiveCodexRun
    binding: ActiveApprovalBinding
  } | null {
    for (const activeRun of this.activeRuns.values()) {
      const binding = activeRun.approvals.get(approvalId)
      if (binding) {
        return { activeRun, binding }
      }
    }

    return null
  }

  private async finalizeRun(
    activeRun: ActiveCodexRun,
    completion: { status: 'completed' | 'failed' | 'cancelled'; error?: string | null }
  ): Promise<void> {
    const scannedArtifacts = this.artifactService.scanOutputs(activeRun.run.outputsPath)
    activeRun.run.artifacts = scannedArtifacts

    const primarySummary = this.artifactService.readPrimarySummary(scannedArtifacts)
    if (activeRun.run.summary == null) {
      const finalMessage = activeRun.finalMessages.join('\n').trim()
      const commentarySummary = activeRun.summaryMessages.join('\n').trim()
      activeRun.run.summary = finalMessage || primarySummary || commentarySummary || null
    }

    if (completion.status === 'completed') {
      activeRun.run.status = 'completed'
    } else if (completion.status === 'cancelled') {
      activeRun.run.status = 'cancelled'
    } else {
      activeRun.run.status = 'failed'
      activeRun.run.error = completion.error || activeRun.run.error
    }

    activeRun.run.completedAt = new Date().toISOString()
    activeRun.run.updatedAt = activeRun.run.completedAt

    this.emitRunEvent(activeRun, {
      eventId: randomUUID(),
      runId: activeRun.run.runId,
      chatId: activeRun.run.chatId,
      type: 'artifact-scan-completed',
      createdAt: new Date().toISOString(),
      status: activeRun.run.status,
      message:
        scannedArtifacts.length > 0
          ? `Discovered ${scannedArtifacts.length} output artifact${scannedArtifacts.length === 1 ? '' : 's'}.`
          : 'No output artifacts were discovered.',
      text: scannedArtifacts.map((artifact) => artifact.relativePath).join('\n')
    })
    await this.writeManifest(activeRun)
  }

  private handleNotification(activeRun: ActiveCodexRun, notification: unknown): void {
    const mappedEvent = mapCodexNotificationToRuntimeEvent({
      runId: activeRun.run.runId,
      chatId: activeRun.run.chatId,
      notification: notification as { method: string; params?: unknown }
    })

    if (mappedEvent) {
      if (mappedEvent.status) {
        activeRun.run.status = mappedEvent.status
        activeRun.run.updatedAt = mappedEvent.createdAt
      }

      if (mappedEvent.type === 'message' && mappedEvent.text) {
        if (mappedEvent.phase === 'final_answer') {
          activeRun.finalMessages.push(mappedEvent.text)
          activeRun.run.summary = activeRun.finalMessages.join('\n').trim() || activeRun.run.summary
        } else {
          activeRun.summaryMessages.push(mappedEvent.text)
        }
      }

      if (mappedEvent.type === 'turn-completed') {
        if (mappedEvent.status === 'completed') {
          this.resolveCompletion(activeRun, {
            status: 'completed'
          })
        } else if (mappedEvent.status === 'cancelled') {
          activeRun.run.error = mappedEvent.message || activeRun.run.error
          this.resolveCompletion(activeRun, {
            status: 'cancelled',
            error: activeRun.run.error
          })
        } else if (mappedEvent.status === 'failed') {
          activeRun.run.error = mappedEvent.message || activeRun.run.error
          this.resolveCompletion(activeRun, {
            status: 'failed',
            error: activeRun.run.error
          })
        }
      }

      this.emitRunEvent(activeRun, mappedEvent)
    }

    const notificationRecord =
      notification && typeof notification === 'object'
        ? (notification as Record<string, unknown>)
        : null
    const method = typeof notificationRecord?.method === 'string' ? notificationRecord.method : null
    const params =
      notificationRecord?.params && typeof notificationRecord.params === 'object'
        ? (notificationRecord.params as Record<string, unknown>)
        : null

    if (method === 'turn/started') {
      const turn = params?.turn as Record<string, unknown> | undefined
      if (typeof turn?.id === 'string') {
        activeRun.turnId = turn.id
      }
    }
  }

  private async handleApprovalRequest(
    activeRun: ActiveCodexRun,
    requestMessage: unknown
  ): Promise<void> {
    const requestRecord =
      requestMessage && typeof requestMessage === 'object'
        ? (requestMessage as Record<string, unknown>)
        : null
    if (!requestRecord) {
      return
    }

    const approvalId = randomUUID()
    const approvalRequest = mapCodexRequestToApproval({
      runId: activeRun.run.runId,
      chatId: activeRun.run.chatId,
      approvalId,
      request: requestMessage as { id: string | number; method: string; params?: unknown }
    })

    if (!approvalRequest) {
      return
    }

    activeRun.approvals.set(approvalId, {
      requestId: approvalRequest.requestId,
      method: requestRecord.method as string,
      createdAt: approvalRequest.createdAt
    })

    appendJsonLine(activeRun.approvalsLogPath, {
      approvalId,
      requestId: approvalRequest.requestId,
      method: requestRecord.method,
      createdAt: approvalRequest.createdAt,
      kind: approvalRequest.kind,
      command: approvalRequest.command,
      cwd: approvalRequest.cwd
    })
    await this.writeManifest(activeRun)
    this.emit('approval-request', approvalRequest satisfies CodexApprovalRequest)
    await this.updateRunStatus(activeRun, 'awaiting-approval')
  }

  private async updateRunStatus(activeRun: ActiveCodexRun, status: CodexRunStatus): Promise<void> {
    activeRun.run.status = status
    activeRun.run.updatedAt = new Date().toISOString()
    await this.writeManifest(activeRun)
  }

  private emitRunEvent(activeRun: ActiveCodexRun, event: CodexRuntimeEvent): void {
    appendJsonLine(activeRun.eventsLogPath, event)
    this.emit('run-event', event)
  }

  private failRun(activeRun: ActiveCodexRun, message: string): void {
    if (activeRun.run.status === 'completed' || activeRun.run.status === 'cancelled') {
      return
    }

    activeRun.run.status = 'failed'
    activeRun.run.error = message
    activeRun.run.updatedAt = new Date().toISOString()
    this.emitRunEvent(activeRun, {
      eventId: randomUUID(),
      runId: activeRun.run.runId,
      chatId: activeRun.run.chatId,
      type: 'error',
      createdAt: activeRun.run.updatedAt,
      status: 'failed',
      message
    })
    this.resolveCompletion(activeRun, {
      status: 'failed',
      error: message
    })
  }

  private resolveCompletion(
    activeRun: ActiveCodexRun,
    value: { status: 'completed' | 'failed' | 'cancelled'; error?: string | null }
  ): void {
    activeRun.completion.resolve(value)
  }

  private async writeManifest(activeRun: ActiveCodexRun): Promise<void> {
    const manifest: CodexRunManifest = {
      runId: activeRun.run.runId,
      chatId: activeRun.run.chatId,
      goal: activeRun.run.goal,
      model: activeRun.run.model,
      reasoningEffort: activeRun.run.reasoningEffort,
      status: activeRun.run.status,
      startedAt: activeRun.run.startedAt,
      updatedAt: activeRun.run.updatedAt,
      completedAt: activeRun.run.completedAt,
      workspacePath: activeRun.run.workspacePath,
      inputsPath: activeRun.run.inputsPath,
      outputsPath: activeRun.run.outputsPath,
      logsPath: activeRun.run.logsPath,
      manifestPath: activeRun.run.manifestPath,
      summary: activeRun.run.summary,
      error: activeRun.run.error,
      artifacts: activeRun.run.artifacts,
      stagedInputs: activeRun.run.stagedInputs
    }

    try {
      await fsp.writeFile(activeRun.run.manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    } catch {
      void 0
    }
  }
}
