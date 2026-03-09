import { BrowserWindow, type IpcMain } from 'electron'
import { z } from 'zod'
import {
  IpcChannels,
  type CodexApprovalDecision,
  type CodexConfig,
  type CodexRunRequest
} from '../../shared/ipc-types'
import { normalizeCodexConfig } from '../services/settings/settings-service-config'
import type { SettingsService } from '../services/settings-service'
import type { CodexRuntimeService } from '../services/codex/codex-runtime-service'

const codexConfigSchema = z
  .object({
    binaryPath: z.string().trim().max(4096).nullable(),
    homePath: z.string().trim().max(4096).nullable(),
    defaultModel: z.string().trim().min(1).max(256),
    reasoningEffort: z.enum(['low', 'medium', 'high']),
    defaultMode: z.literal('workspace-approval')
  })
  .strict()

const codexRunRequestSchema = z
  .object({
    chatId: z.string().trim().min(1).max(256),
    goal: z.string().trim().min(1).max(20_000),
    filePaths: z.array(z.string().trim().min(1).max(4096)).max(64).optional(),
    layerIds: z.array(z.string().trim().min(1).max(256)).max(128).optional(),
    expectedOutputs: z.array(z.string().trim().min(1).max(512)).max(32).optional(),
    importPreference: z.enum(['none', 'suggest']).optional(),
    model: z.string().trim().min(1).max(256).nullable().optional(),
    reasoningEffort: z.enum(['low', 'medium', 'high']).optional()
  })
  .strict()

const codexApprovalDecisionSchema = z
  .object({
    approvalId: z.string().uuid(),
    scope: z.enum(['once', 'run'])
  })
  .strict()

const codexApprovalIdSchema = z.string().uuid()
const codexRunIdSchema = z.string().uuid()
const optionalChatIdSchema = z.string().trim().min(1).max(256).optional()

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

export function registerCodexIpcHandlers(
  ipcMain: IpcMain,
  settingsService: SettingsService,
  codexRuntimeService: CodexRuntimeService
): void {
  codexRuntimeService.on('run-event', (event) => {
    broadcast(IpcChannels.codexRunEvent, event)
  })

  codexRuntimeService.on('approval-request', (request) => {
    broadcast(IpcChannels.codexApprovalRequestEvent, request)
  })

  codexRuntimeService.on('health-updated', (status) => {
    broadcast(IpcChannels.codexHealthUpdatedEvent, status)
  })

  ipcMain.handle(IpcChannels.getCodexConfig, async () => {
    return settingsService.getCodexConfig()
  })

  ipcMain.handle(IpcChannels.setCodexConfig, async (_event, rawConfig: unknown) => {
    const parsed = codexConfigSchema.parse(rawConfig) satisfies CodexConfig
    const normalized = normalizeCodexConfig(parsed)
    await settingsService.setCodexConfig(normalized)
    await codexRuntimeService.getHealth(normalized)
    return { success: true }
  })

  ipcMain.handle(IpcChannels.getCodexHealth, async () => {
    return codexRuntimeService.getHealth()
  })

  ipcMain.handle(IpcChannels.codexStartRun, async (_event, rawRequest: unknown) => {
    const request = codexRunRequestSchema.parse(rawRequest) satisfies CodexRunRequest
    return codexRuntimeService.startRun(request)
  })

  ipcMain.handle(IpcChannels.codexCancelRun, async (_event, rawRunId: unknown) => {
    const runId = codexRunIdSchema.parse(rawRunId)
    return codexRuntimeService.cancelRun(runId)
  })

  ipcMain.handle(IpcChannels.codexGetRun, async (_event, rawRunId: unknown) => {
    const runId = codexRunIdSchema.parse(rawRunId)
    return codexRuntimeService.getRun(runId)
  })

  ipcMain.handle(IpcChannels.codexListRuns, async (_event, rawChatId?: unknown) => {
    const chatId = optionalChatIdSchema.parse(rawChatId)
    return codexRuntimeService.listRuns(chatId)
  })

  ipcMain.handle(IpcChannels.codexApproveRequest, async (_event, rawDecision: unknown) => {
    const decision = codexApprovalDecisionSchema.parse(rawDecision) satisfies CodexApprovalDecision
    await codexRuntimeService.approveRequest(decision)
  })

  ipcMain.handle(IpcChannels.codexDenyRequest, async (_event, rawApprovalId: unknown) => {
    const approvalId = codexApprovalIdSchema.parse(rawApprovalId)
    await codexRuntimeService.denyRequest(approvalId)
  })
}
