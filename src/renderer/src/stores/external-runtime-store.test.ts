import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExternalRuntimeConfig,
  ExternalRuntimeDescriptor,
  ExternalRuntimeHealthStatus,
  ExternalRuntimeRunRecord,
  ExternalRuntimeEvent
} from '../../../shared/ipc-types'

const externalRuntimeApiMocks = vi.hoisted(() => {
  let onRunEventHandler: ((event: ExternalRuntimeEvent) => void) | null = null

  return {
    listRuntimes: vi.fn<() => Promise<ExternalRuntimeDescriptor[]>>(),
    getConfig: vi.fn<() => Promise<ExternalRuntimeConfig>>(),
    setConfig: vi.fn(),
    getHealth: vi.fn<() => Promise<ExternalRuntimeHealthStatus>>(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    approveRequest: vi.fn(),
    denyRequest: vi.fn(),
    onRunEvent: vi.fn((handler: (event: ExternalRuntimeEvent) => void) => {
      onRunEventHandler = handler
      return () => {
        onRunEventHandler = null
      }
    }),
    onApprovalRequest: vi.fn(() => () => void 0),
    onHealthUpdated: vi.fn(() => () => void 0),
    emitRunEvent: (event: ExternalRuntimeEvent) => {
      onRunEventHandler?.(event)
    },
    resetHandlers: () => {
      onRunEventHandler = null
    }
  }
})

const settingsApiMocks = vi.hoisted(() => {
  let activeRuntimeId: string | null = null

  return {
    getSetting: vi.fn(async (key: string) => {
      if (key === 'activeExternalRuntimeId') {
        return activeRuntimeId
      }
      return undefined
    }),
    setSetting: vi.fn(async (key: string, value: unknown) => {
      if (key === 'activeExternalRuntimeId') {
        activeRuntimeId = typeof value === 'string' ? value : null
      }
      return { success: true }
    }),
    reset: () => {
      activeRuntimeId = null
    }
  }
})

Object.defineProperty(globalThis, 'window', {
  value: {
    ctg: {
      externalRuntimes: externalRuntimeApiMocks,
      settings: settingsApiMocks
    }
  },
  configurable: true
})

import {
  disposeExternalRuntimeStoreListeners,
  getExternalRuntimeRunKey,
  useExternalRuntimeStore
} from './external-runtime-store'

function resetStoreState(): void {
  useExternalRuntimeStore.setState((state) => ({
    ...state,
    descriptors: [],
    configs: {},
    healthByRuntime: {},
    runs: {},
    runEvents: {},
    approvalRequests: [],
    activeRuntimeId: null,
    loadingConfigByRuntime: {},
    loadingHealthByRuntime: {},
    isInitialized: false,
    isLoadingRuntimes: false,
    isLoadingRuns: false,
    isResolvingApproval: false,
    error: null
  }))
}

function createRun(overrides?: Partial<ExternalRuntimeRunRecord>): ExternalRuntimeRunRecord {
  return {
    runtimeId: 'codex',
    runtimeName: 'Codex',
    runId: 'run-1',
    chatId: 'chat-1',
    status: 'running',
    goal: 'Analyze staged inputs.',
    model: 'gpt-5.3-codex',
    reasoningEffort: 'medium',
    workspacePath: 'C:/workspace',
    inputsPath: 'C:/workspace/inputs',
    outputsPath: 'C:/workspace/outputs',
    logsPath: 'C:/workspace/logs',
    manifestPath: 'C:/workspace/manifest.json',
    startedAt: '2026-03-09T12:00:00.000Z',
    updatedAt: '2026-03-09T12:00:00.000Z',
    completedAt: null,
    summary: null,
    error: null,
    artifacts: [],
    ...overrides
  }
}

describe('external-runtime-store', () => {
  beforeEach(async () => {
    disposeExternalRuntimeStoreListeners()
    externalRuntimeApiMocks.resetHandlers()
    settingsApiMocks.reset()
    vi.clearAllMocks()
    resetStoreState()

    externalRuntimeApiMocks.listRuntimes.mockResolvedValue([
      {
        id: 'codex',
        name: 'Codex',
        description: 'Local Codex CLI runtime',
        runtimeKind: 'coding-runtime',
        providerHint: 'openai',
        defaultConfig: {
          binaryPath: null,
          homePath: null,
          defaultModel: 'gpt-5.3-codex',
          reasoningEffort: 'medium',
          defaultMode: 'workspace-approval'
        },
        configFields: []
      }
    ])
    externalRuntimeApiMocks.getConfig.mockResolvedValue({
      binaryPath: null,
      homePath: null,
      defaultModel: 'gpt-5.3-codex',
      reasoningEffort: 'medium',
      defaultMode: 'workspace-approval'
    })
    externalRuntimeApiMocks.getHealth.mockResolvedValue({
      runtimeId: 'codex',
      runtimeName: 'Codex',
      checkedAt: '2026-03-09T12:00:00.000Z',
      install: {
        state: 'installed',
        version: '0.37.0',
        minimumSupportedVersion: '0.37.0',
        message: 'Codex CLI is installed.'
      },
      authState: 'authenticated',
      authMessage: 'Codex CLI is authenticated.',
      isReady: true
    })

    await useExternalRuntimeStore.getState().initialize()
  })

  it('keeps runtimes disabled when no runtime is configured yet', () => {
    expect(useExternalRuntimeStore.getState().activeRuntimeId).toBeNull()
    expect(settingsApiMocks.setSetting).not.toHaveBeenCalledWith('activeExternalRuntimeId', 'codex')
  })

  it('surfaces persistence failures when updating the active runtime', async () => {
    settingsApiMocks.setSetting.mockResolvedValueOnce({
      success: false,
      error: 'Database unavailable'
    } as {
      success: boolean
      error?: string
    })

    await expect(useExternalRuntimeStore.getState().setActiveRuntime('codex')).rejects.toThrow(
      'Database unavailable'
    )
    expect(useExternalRuntimeStore.getState().activeRuntimeId).toBeNull()
    expect(useExternalRuntimeStore.getState().error).toBe('Database unavailable')
  })

  it('does not surface non-terminal error events as run failures', () => {
    const runKey = getExternalRuntimeRunKey('codex', 'run-1')
    useExternalRuntimeStore.setState((state) => ({
      ...state,
      runs: {
        [runKey]: createRun()
      }
    }))

    externalRuntimeApiMocks.emitRunEvent({
      runtimeId: 'codex',
      runtimeName: 'Codex',
      eventId: 'event-1',
      runId: 'run-1',
      chatId: 'chat-1',
      type: 'error',
      createdAt: '2026-03-09T12:01:00.000Z',
      message: 'process/stderr'
    })

    expect(useExternalRuntimeStore.getState().runs[runKey]?.error).toBeNull()
  })

  it('clears stale approval requests once a run reaches a terminal status', () => {
    const runKey = getExternalRuntimeRunKey('codex', 'run-1')
    useExternalRuntimeStore.setState((state) => ({
      ...state,
      runs: {
        [runKey]: createRun()
      },
      approvalRequests: [
        {
          runtimeId: 'codex',
          runtimeName: 'Codex',
          approvalId: 'approval-1',
          runId: 'run-1',
          chatId: 'chat-1',
          kind: 'command',
          createdAt: '2026-03-09T12:00:30.000Z',
          requestId: 'rpc-1'
        },
        {
          runtimeId: 'codex',
          runtimeName: 'Codex',
          approvalId: 'approval-2',
          runId: 'run-2',
          chatId: 'chat-2',
          kind: 'command',
          createdAt: '2026-03-09T12:00:31.000Z',
          requestId: 'rpc-2'
        }
      ]
    }))

    externalRuntimeApiMocks.emitRunEvent({
      runtimeId: 'codex',
      runtimeName: 'Codex',
      eventId: 'event-2',
      runId: 'run-1',
      chatId: 'chat-1',
      type: 'turn-completed',
      createdAt: '2026-03-09T12:02:00.000Z',
      status: 'completed'
    })

    expect(useExternalRuntimeStore.getState().approvalRequests).toEqual([
      expect.objectContaining({ approvalId: 'approval-2', runId: 'run-2' })
    ])
  })
})
