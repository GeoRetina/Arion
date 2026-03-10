import { BrowserWindow, type IpcMain } from 'electron'
import { z } from 'zod'
import {
  IpcChannels,
  type ExternalRuntimeApprovalDecision,
  type ExternalRuntimeConfig,
  type ExternalRuntimeRunRequest
} from '../../shared/ipc-types'
import type { ExternalRuntimeRegistry } from '../services/external-runtimes/external-runtime-registry'

const runtimeIdSchema = z.string().trim().min(1).max(128)

const externalRuntimeConfigSchema = z.record(
  z.string(),
  z.union([z.string(), z.boolean(), z.null()])
)

const externalRuntimeRunRequestSchema = z
  .object({
    runtimeId: runtimeIdSchema,
    chatId: z.string().trim().min(1).max(256),
    goal: z.string().trim().min(1).max(20_000),
    filePaths: z.array(z.string().trim().min(1).max(4096)).max(64).optional(),
    layerIds: z.array(z.string().trim().min(1).max(256)).max(128).optional(),
    expectedOutputs: z.array(z.string().trim().min(1).max(512)).max(32).optional(),
    importPreference: z.enum(['none', 'suggest']).optional(),
    model: z.string().trim().min(1).max(256).nullable().optional(),
    reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional()
  })
  .strict()

const externalRuntimeApproveSchema = z
  .object({
    runtimeId: runtimeIdSchema,
    approvalId: z.string().uuid(),
    scope: z.enum(['once', 'run'])
  })
  .strict()

const externalRuntimeDenySchema = z
  .object({
    runtimeId: runtimeIdSchema,
    approvalId: z.string().uuid()
  })
  .strict()

const externalRuntimeRunRefSchema = z
  .object({
    runtimeId: runtimeIdSchema,
    runId: z.string().uuid()
  })
  .strict()

const externalRuntimeListRunsSchema = z
  .object({
    chatId: z.string().trim().min(1).max(256).optional(),
    runtimeId: runtimeIdSchema.optional()
  })
  .strict()
  .optional()

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

export function registerExternalRuntimeIpcHandlers(
  ipcMain: IpcMain,
  externalRuntimeRegistry: ExternalRuntimeRegistry
): void {
  externalRuntimeRegistry.on('run-event', (event) => {
    broadcast(IpcChannels.externalRuntimeRunEvent, event)
  })

  externalRuntimeRegistry.on('approval-request', (request) => {
    broadcast(IpcChannels.externalRuntimeApprovalRequestEvent, request)
  })

  externalRuntimeRegistry.on('health-updated', (status) => {
    broadcast(IpcChannels.externalRuntimeHealthUpdatedEvent, status)
  })

  ipcMain.handle(IpcChannels.externalRuntimesList, async () => {
    return externalRuntimeRegistry.listRuntimes()
  })

  ipcMain.handle(
    IpcChannels.externalRuntimeGetConfig,
    async (_event, rawRuntimeId: unknown): Promise<ExternalRuntimeConfig> => {
      const runtimeId = runtimeIdSchema.parse(rawRuntimeId)
      return externalRuntimeRegistry.getConfig(runtimeId)
    }
  )

  ipcMain.handle(
    IpcChannels.externalRuntimeSetConfig,
    async (_event, rawRuntimeId: unknown, rawConfig: unknown): Promise<void> => {
      const runtimeId = runtimeIdSchema.parse(rawRuntimeId)
      const config = externalRuntimeConfigSchema.parse(rawConfig) satisfies ExternalRuntimeConfig
      await externalRuntimeRegistry.saveConfig(runtimeId, config)
    }
  )

  ipcMain.handle(IpcChannels.externalRuntimeGetHealth, async (_event, rawRuntimeId: unknown) => {
    const runtimeId = runtimeIdSchema.parse(rawRuntimeId)
    return externalRuntimeRegistry.getHealth(runtimeId)
  })

  ipcMain.handle(IpcChannels.externalRuntimeStartRun, async (_event, rawRequest: unknown) => {
    const request = externalRuntimeRunRequestSchema.parse(
      rawRequest
    ) satisfies ExternalRuntimeRunRequest
    return externalRuntimeRegistry.startRun(request)
  })

  ipcMain.handle(IpcChannels.externalRuntimeCancelRun, async (_event, rawRef: unknown) => {
    const ref = externalRuntimeRunRefSchema.parse(rawRef)
    return externalRuntimeRegistry.cancelRun(ref.runtimeId, ref.runId)
  })

  ipcMain.handle(IpcChannels.externalRuntimeGetRun, async (_event, rawRef: unknown) => {
    const ref = externalRuntimeRunRefSchema.parse(rawRef)
    return externalRuntimeRegistry.getRun(ref.runtimeId, ref.runId)
  })

  ipcMain.handle(IpcChannels.externalRuntimeListRuns, async (_event, rawOptions?: unknown) => {
    const options = externalRuntimeListRunsSchema.parse(rawOptions)
    return externalRuntimeRegistry.listRuns(options)
  })

  ipcMain.handle(
    IpcChannels.externalRuntimeApproveRequest,
    async (_event, rawDecision: unknown) => {
      const decision = externalRuntimeApproveSchema.parse(
        rawDecision
      ) satisfies ExternalRuntimeApprovalDecision
      await externalRuntimeRegistry.approveRequest(decision)
    }
  )

  ipcMain.handle(IpcChannels.externalRuntimeDenyRequest, async (_event, rawDecision: unknown) => {
    const decision = externalRuntimeDenySchema.parse(rawDecision)
    await externalRuntimeRegistry.denyRequest(decision.runtimeId, decision.approvalId)
  })
}
