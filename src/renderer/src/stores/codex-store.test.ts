import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodexConfig, CodexHealthStatus, CodexRunRecord, CodexRuntimeEvent } from '../../../shared/ipc-types'

const codexApiMocks = vi.hoisted(() => {
  let onRunEventHandler: ((event: CodexRuntimeEvent) => void) | null = null

  return {
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    approveRequest: vi.fn(),
    denyRequest: vi.fn(),
    onRunEvent: vi.fn((handler: (event: CodexRuntimeEvent) => void) => {
      onRunEventHandler = handler
      return () => {
        onRunEventHandler = null
      }
    }),
    onApprovalRequest: vi.fn(() => () => void 0),
    onHealthUpdated: vi.fn(() => () => void 0),
    emitRunEvent: (event: CodexRuntimeEvent) => {
      onRunEventHandler?.(event)
    },
    resetHandlers: () => {
      onRunEventHandler = null
    }
  }
})

const settingsApiMocks = vi.hoisted(() => ({
  getCodexConfig: vi.fn<() => Promise<CodexConfig>>(),
  setCodexConfig: vi.fn(),
  getCodexHealth: vi.fn<() => Promise<CodexHealthStatus>>()
}))

Object.defineProperty(globalThis, 'window', {
  value: {
    ctg: {
      codex: codexApiMocks,
      settings: settingsApiMocks
    }
  },
  configurable: true
})

import { disposeCodexStoreListeners, useCodexStore } from './codex-store'

function resetStoreState(): void {
  useCodexStore.setState((state) => ({
    ...state,
    config: null,
    health: null,
    runs: {},
    runEvents: {},
    approvalRequests: [],
    isInitialized: false,
    isLoadingConfig: false,
    isLoadingHealth: false,
    isLoadingRuns: false,
    isResolvingApproval: false,
    error: null
  }))
}

function createRun(overrides?: Partial<CodexRunRecord>): CodexRunRecord {
  return {
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

describe('codex-store', () => {
  beforeEach(async () => {
    disposeCodexStoreListeners()
    codexApiMocks.resetHandlers()
    vi.clearAllMocks()
    resetStoreState()

    settingsApiMocks.getCodexConfig.mockResolvedValue({
      binaryPath: null,
      homePath: null,
      defaultModel: 'gpt-5.3-codex',
      reasoningEffort: 'medium',
      defaultMode: 'workspace-approval'
    })
    settingsApiMocks.getCodexHealth.mockResolvedValue({
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

    await useCodexStore.getState().initialize()
  })

  it('does not surface non-terminal error events as run failures', () => {
    useCodexStore.setState((state) => ({
      ...state,
      runs: {
        'run-1': createRun()
      }
    }))

    codexApiMocks.emitRunEvent({
      eventId: 'event-1',
      runId: 'run-1',
      chatId: 'chat-1',
      type: 'error',
      createdAt: '2026-03-09T12:01:00.000Z',
      message: 'process/stderr'
    })

    expect(useCodexStore.getState().runs['run-1']?.error).toBeNull()
  })

  it('clears stale approval requests once a run reaches a terminal status', () => {
    useCodexStore.setState((state) => ({
      ...state,
      runs: {
        'run-1': createRun()
      },
      approvalRequests: [
        {
          approvalId: 'approval-1',
          runId: 'run-1',
          chatId: 'chat-1',
          kind: 'command',
          createdAt: '2026-03-09T12:00:30.000Z',
          requestId: 'rpc-1'
        },
        {
          approvalId: 'approval-2',
          runId: 'run-2',
          chatId: 'chat-2',
          kind: 'command',
          createdAt: '2026-03-09T12:00:31.000Z',
          requestId: 'rpc-2'
        }
      ]
    }))

    codexApiMocks.emitRunEvent({
      eventId: 'event-2',
      runId: 'run-1',
      chatId: 'chat-1',
      type: 'turn-completed',
      createdAt: '2026-03-09T12:02:00.000Z',
      status: 'completed'
    })

    expect(useCodexStore.getState().approvalRequests).toEqual([
      expect.objectContaining({ approvalId: 'approval-2', runId: 'run-2' })
    ])
  })
})
