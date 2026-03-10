import { EventEmitter } from 'events'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
  CodexConfig,
  CodexHealthStatus,
  CodexRunRecord,
  CodexRunResult,
  CodexRuntimeEvent,
  ExternalRuntimeApprovalDecision,
  ExternalRuntimeApprovalRequest,
  ExternalRuntimeConfig,
  ExternalRuntimeDescriptor,
  ExternalRuntimeEvent,
  ExternalRuntimeHealthStatus,
  ExternalRuntimeRunRecord,
  ExternalRuntimeRunRequest,
  ExternalRuntimeRunResult
} from '../../../../shared/ipc-types'
import { normalizeCodexConfig } from '../../settings/settings-service-config'
import type { SettingsService } from '../../settings-service'
import type { CodexRuntimeService } from '../../codex/codex-runtime-service'
import type { ExternalRuntimeAdapter } from '../external-runtime-adapter'

const CODEX_RUNTIME_ID = 'codex'
const CODEX_RUNTIME_NAME = 'Codex'
const CODEX_DEFAULT_CONFIG: CodexConfig = {
  binaryPath: null,
  homePath: null,
  defaultModel: 'gpt-5.3-codex',
  reasoningEffort: 'high',
  defaultMode: 'workspace-approval'
}

const CODEX_DESCRIPTOR: ExternalRuntimeDescriptor = {
  id: CODEX_RUNTIME_ID,
  name: CODEX_RUNTIME_NAME,
  description: 'Local Codex CLI runtime',
  runtimeKind: 'coding-runtime',
  providerHint: 'openai',
  defaultConfig: toExternalConfig(CODEX_DEFAULT_CONFIG),
  configFields: [
    {
      key: 'binaryPath',
      label: 'Codex binary path',
      type: 'path',
      placeholder: 'codex',
      description: 'Leave blank to use `codex` from your system PATH.'
    },
    {
      key: 'homePath',
      label: 'CODEX_HOME override',
      type: 'path',
      placeholder: 'Optional custom Codex home directory',
      description: 'Optional. Use this only if you keep Codex state in a non-default location.'
    },
    {
      key: 'defaultModel',
      label: 'Model',
      type: 'text',
      required: true,
      showInSummary: true
    },
    {
      key: 'reasoningEffort',
      label: 'Effort',
      type: 'select',
      required: true,
      showInSummary: true,
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'Extra High' }
      ]
    },
    {
      key: 'defaultMode',
      label: 'Execution mode',
      type: 'select',
      readOnly: true,
      description: 'Workspace approval only',
      options: [{ value: 'workspace-approval', label: 'Workspace approval only' }]
    }
  ],
  loginCommand: 'codex login',
  setupNotes: ['Execution mode: Workspace approval only']
}

function toExternalConfig(config: CodexConfig): ExternalRuntimeConfig {
  return {
    binaryPath: config.binaryPath,
    homePath: config.homePath,
    defaultModel: config.defaultModel,
    reasoningEffort: config.reasoningEffort,
    defaultMode: config.defaultMode
  }
}

function toCodexConfig(config: ExternalRuntimeConfig): CodexConfig {
  return normalizeCodexConfig({
    binaryPath: typeof config.binaryPath === 'string' ? config.binaryPath : null,
    homePath: typeof config.homePath === 'string' ? config.homePath : null,
    defaultModel:
      typeof config.defaultModel === 'string'
        ? config.defaultModel
        : CODEX_DEFAULT_CONFIG.defaultModel,
    reasoningEffort:
      config.reasoningEffort === 'low' ||
      config.reasoningEffort === 'medium' ||
      config.reasoningEffort === 'high' ||
      config.reasoningEffort === 'xhigh'
        ? config.reasoningEffort
        : CODEX_DEFAULT_CONFIG.reasoningEffort,
    defaultMode: 'workspace-approval'
  })
}

function toExternalHealth(health: CodexHealthStatus): ExternalRuntimeHealthStatus {
  return {
    runtimeId: CODEX_RUNTIME_ID,
    runtimeName: CODEX_RUNTIME_NAME,
    ...health
  }
}

function toExternalRunRecord(run: CodexRunRecord): ExternalRuntimeRunRecord {
  return {
    runtimeId: CODEX_RUNTIME_ID,
    runtimeName: CODEX_RUNTIME_NAME,
    ...run
  }
}

function toExternalRunResult(run: CodexRunResult): ExternalRuntimeRunResult {
  return {
    runtimeId: CODEX_RUNTIME_ID,
    runtimeName: CODEX_RUNTIME_NAME,
    ...run
  }
}

function toExternalEvent(event: CodexRuntimeEvent): ExternalRuntimeEvent {
  return {
    runtimeId: CODEX_RUNTIME_ID,
    runtimeName: CODEX_RUNTIME_NAME,
    ...event
  }
}

function toExternalApprovalRequest(request: CodexApprovalRequest): ExternalRuntimeApprovalRequest {
  return {
    runtimeId: CODEX_RUNTIME_ID,
    runtimeName: CODEX_RUNTIME_NAME,
    ...request
  }
}

export class CodexExternalRuntimeAdapter extends EventEmitter implements ExternalRuntimeAdapter {
  readonly descriptor = CODEX_DESCRIPTOR

  constructor(
    private readonly settingsService: SettingsService,
    private readonly codexRuntimeService: CodexRuntimeService
  ) {
    super()

    this.codexRuntimeService.on('run-event', (event) => {
      this.emit('run-event', toExternalEvent(event satisfies CodexRuntimeEvent))
    })
    this.codexRuntimeService.on('approval-request', (request) => {
      this.emit(
        'approval-request',
        toExternalApprovalRequest(request satisfies CodexApprovalRequest)
      )
    })
    this.codexRuntimeService.on('health-updated', (status) => {
      this.emit('health-updated', toExternalHealth(status satisfies CodexHealthStatus))
    })
  }

  async getConfig(): Promise<ExternalRuntimeConfig> {
    const config = await this.settingsService.getCodexConfig()
    return toExternalConfig(config)
  }

  async saveConfig(config: ExternalRuntimeConfig): Promise<void> {
    const normalized = toCodexConfig(config)
    await this.settingsService.setCodexConfig(normalized)
    await this.codexRuntimeService.getHealth(normalized)
  }

  async getHealth(configOverride?: ExternalRuntimeConfig): Promise<ExternalRuntimeHealthStatus> {
    const normalized = configOverride ? toCodexConfig(configOverride) : undefined
    const health = await this.codexRuntimeService.getHealth(normalized)
    return toExternalHealth(health)
  }

  async startRun(request: ExternalRuntimeRunRequest): Promise<ExternalRuntimeRunResult> {
    const run = await this.codexRuntimeService.startRun({
      chatId: request.chatId,
      goal: request.goal,
      filePaths: request.filePaths,
      layerIds: request.layerIds,
      expectedOutputs: request.expectedOutputs,
      importPreference: request.importPreference,
      model: request.model,
      reasoningEffort: request.reasoningEffort
    })

    return toExternalRunResult(run)
  }

  async cancelRun(runId: string): Promise<boolean> {
    return this.codexRuntimeService.cancelRun(runId)
  }

  async getRun(runId: string): Promise<ExternalRuntimeRunResult | null> {
    const run = this.codexRuntimeService.getRun(runId)
    return run ? toExternalRunResult(run) : null
  }

  async listRuns(chatId?: string): Promise<ExternalRuntimeRunRecord[]> {
    return this.codexRuntimeService.listRuns(chatId).map((run) => toExternalRunRecord(run))
  }

  async approveRequest(decision: ExternalRuntimeApprovalDecision): Promise<void> {
    await this.codexRuntimeService.approveRequest({
      approvalId: decision.approvalId,
      scope: decision.scope
    } satisfies CodexApprovalDecision)
  }

  async denyRequest(approvalId: string): Promise<void> {
    await this.codexRuntimeService.denyRequest(approvalId)
  }
}
