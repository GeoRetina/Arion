import { create } from 'zustand'
import type {
  CodexApprovalScope,
  CodexApprovalRequest,
  CodexConfig,
  CodexHealthStatus,
  CodexRunRecord,
  CodexRunResult,
  CodexRuntimeEvent
} from '../../../shared/ipc-types'

type CodexStoredRun = CodexRunRecord | CodexRunResult

function isTerminalStatus(
  status: CodexRunRecord['status'] | CodexRunResult['status'] | undefined
): status is 'completed' | 'failed' | 'cancelled' {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

interface CodexState {
  config: CodexConfig | null
  health: CodexHealthStatus | null
  runs: Record<string, CodexStoredRun>
  runEvents: Record<string, CodexRuntimeEvent[]>
  approvalRequests: CodexApprovalRequest[]
  isInitialized: boolean
  isLoadingConfig: boolean
  isLoadingHealth: boolean
  isLoadingRuns: boolean
  isResolvingApproval: boolean
  error: string | null
  initialize: () => Promise<void>
  loadConfig: () => Promise<void>
  saveConfig: (config: CodexConfig) => Promise<void>
  refreshHealth: () => Promise<CodexHealthStatus | null>
  loadRuns: (chatId?: string) => Promise<void>
  refreshRun: (runId: string) => Promise<void>
  approveRequest: (approvalId: string, scope: CodexApprovalScope) => Promise<void>
  denyRequest: (approvalId: string) => Promise<void>
  clearError: () => void
  getRun: (runId: string) => CodexStoredRun | undefined
}

let listenerCleanupRegistered = false
let listenerCleanups: Array<() => void> = []

function mergeRun(existing: CodexStoredRun | undefined, incoming: CodexStoredRun): CodexStoredRun {
  if (!existing) {
    return incoming
  }

  if ('stagedInputs' in existing && !('stagedInputs' in incoming)) {
    return {
      ...existing,
      ...incoming
    } satisfies CodexRunResult
  }

  return {
    ...existing,
    ...incoming
  } as CodexStoredRun
}

function updateRunFromEvent(
  run: CodexStoredRun | undefined,
  event: CodexRuntimeEvent
): CodexStoredRun | undefined {
  if (!run) {
    return run
  }

  const nextRun = {
    ...run,
    updatedAt: event.createdAt,
    ...(event.status ? { status: event.status } : {})
  } as CodexStoredRun

  if (event.type === 'message' && event.phase === 'final_answer' && event.text) {
    nextRun.summary = event.text
  }

  if (event.type === 'error' && event.message && isTerminalStatus(event.status ?? nextRun.status)) {
    nextRun.error = event.message
  }

  if (event.type === 'turn-completed' && event.status && event.status !== 'running') {
    nextRun.status = event.status
    if (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled') {
      nextRun.completedAt = event.createdAt
      if (event.status !== 'completed' && event.message) {
        nextRun.error = event.message
      }
    }
  }

  return nextRun
}

export const useCodexStore = create<CodexState>((set, get) => ({
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
  error: null,

  initialize: async () => {
    if (!listenerCleanupRegistered) {
      listenerCleanupRegistered = true
      listenerCleanups = [
        window.ctg.codex.onRunEvent((event) => {
          const hasKnownRun = Boolean(get().runs[event.runId])
          set((state) => {
            const existingRun = state.runs[event.runId]
            const nextEvents = [...(state.runEvents[event.runId] || []), event].slice(-200)
            return {
              approvalRequests: isTerminalStatus(event.status)
                ? state.approvalRequests.filter((request) => request.runId !== event.runId)
                : state.approvalRequests,
              runEvents: {
                ...state.runEvents,
                [event.runId]: nextEvents
              },
              runs: {
                ...state.runs,
                ...(existingRun
                  ? {
                      [event.runId]: updateRunFromEvent(existingRun, event) as CodexStoredRun
                    }
                  : {})
              }
            }
          })

          if (!hasKnownRun) {
            void get().refreshRun(event.runId)
          }
        }),
        window.ctg.codex.onApprovalRequest((request) => {
          const hasKnownRun = Boolean(get().runs[request.runId])
          set((state) => ({
            approvalRequests: state.approvalRequests.some(
              (existing) => existing.approvalId === request.approvalId
            )
              ? state.approvalRequests
              : [...state.approvalRequests, request]
          }))

          if (!hasKnownRun) {
            void get().refreshRun(request.runId)
          }
        }),
        window.ctg.codex.onHealthUpdated((status) => {
          set({ health: status })
        })
      ]
    }

    if (get().isInitialized) {
      return
    }

    set({ isInitialized: true })
    await Promise.all([get().loadConfig(), get().refreshHealth()])
  },

  loadConfig: async () => {
    set({ isLoadingConfig: true, error: null })
    try {
      const config = await window.ctg.settings.getCodexConfig()
      set({ config, isLoadingConfig: false })
    } catch (error) {
      set({
        isLoadingConfig: false,
        error: error instanceof Error ? error.message : 'Failed to load Codex configuration.'
      })
    }
  },

  saveConfig: async (config) => {
    set({ isLoadingConfig: true, error: null })
    try {
      await window.ctg.settings.setCodexConfig(config)
      const [nextConfig, nextHealth] = await Promise.all([
        window.ctg.settings.getCodexConfig(),
        window.ctg.settings.getCodexHealth()
      ])
      set({
        config: nextConfig,
        health: nextHealth,
        isLoadingConfig: false,
        isLoadingHealth: false
      })
    } catch (error) {
      set({
        isLoadingConfig: false,
        error: error instanceof Error ? error.message : 'Failed to save Codex configuration.'
      })
      throw error
    }
  },

  refreshHealth: async () => {
    set({ isLoadingHealth: true, error: null })
    try {
      const health = await window.ctg.settings.getCodexHealth()
      set({ health, isLoadingHealth: false })
      return health
    } catch (error) {
      set({
        isLoadingHealth: false,
        error: error instanceof Error ? error.message : 'Failed to refresh Codex health.'
      })
      return null
    }
  },

  loadRuns: async (chatId) => {
    set({ isLoadingRuns: true, error: null })
    try {
      const runs = await window.ctg.codex.listRuns(chatId)
      set((state) => {
        const nextRuns = { ...state.runs }
        runs.forEach((run) => {
          nextRuns[run.runId] = mergeRun(nextRuns[run.runId], run)
        })
        return {
          runs: nextRuns,
          isLoadingRuns: false
        }
      })
    } catch (error) {
      set({
        isLoadingRuns: false,
        error: error instanceof Error ? error.message : 'Failed to load Codex runs.'
      })
    }
  },

  refreshRun: async (runId) => {
    try {
      const run = await window.ctg.codex.getRun(runId)
      if (!run) {
        return
      }
      set((state) => ({
        runs: {
          ...state.runs,
          [runId]: mergeRun(state.runs[runId], run)
        }
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : `Failed to refresh Codex run ${runId}.`
      })
    }
  },

  approveRequest: async (approvalId, scope) => {
    set({ isResolvingApproval: true, error: null })
    try {
      await window.ctg.codex.approveRequest({
        approvalId,
        scope
      })
      set((state) => ({
        approvalRequests: state.approvalRequests.filter(
          (request) => request.approvalId !== approvalId
        ),
        isResolvingApproval: false
      }))
    } catch (error) {
      set({
        isResolvingApproval: false,
        error: error instanceof Error ? error.message : 'Failed to approve the Codex request.'
      })
      throw error
    }
  },

  denyRequest: async (approvalId) => {
    set({ isResolvingApproval: true, error: null })
    try {
      await window.ctg.codex.denyRequest(approvalId)
      set((state) => ({
        approvalRequests: state.approvalRequests.filter(
          (request) => request.approvalId !== approvalId
        ),
        isResolvingApproval: false
      }))
    } catch (error) {
      set({
        isResolvingApproval: false,
        error: error instanceof Error ? error.message : 'Failed to deny the Codex request.'
      })
      throw error
    }
  },

  clearError: () => {
    set({ error: null })
  },

  getRun: (runId) => {
    return get().runs[runId]
  }
}))

export function disposeCodexStoreListeners(): void {
  listenerCleanups.forEach((cleanup) => cleanup())
  listenerCleanups = []
  listenerCleanupRegistered = false
}
