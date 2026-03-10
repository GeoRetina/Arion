import { create } from 'zustand'
import type {
  ExternalRuntimeApprovalRequest,
  ExternalRuntimeApprovalScope,
  ExternalRuntimeConfig,
  ExternalRuntimeDescriptor,
  ExternalRuntimeHealthStatus,
  ExternalRuntimeRunRecord,
  ExternalRuntimeRunResult,
  ExternalRuntimeEvent
} from '../../../shared/ipc-types'

type ExternalRuntimeStoredRun = ExternalRuntimeRunRecord | ExternalRuntimeRunResult

function getRunKey(runtimeId: string, runId: string): string {
  return `${runtimeId}:${runId}`
}

function isTerminalStatus(
  status: ExternalRuntimeRunRecord['status'] | ExternalRuntimeRunResult['status'] | undefined
): status is 'completed' | 'failed' | 'cancelled' {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

interface ExternalRuntimeState {
  descriptors: ExternalRuntimeDescriptor[]
  configs: Record<string, ExternalRuntimeConfig>
  healthByRuntime: Record<string, ExternalRuntimeHealthStatus | null>
  runs: Record<string, ExternalRuntimeStoredRun>
  runEvents: Record<string, ExternalRuntimeEvent[]>
  approvalRequests: ExternalRuntimeApprovalRequest[]
  loadingConfigByRuntime: Record<string, boolean>
  loadingHealthByRuntime: Record<string, boolean>
  isInitialized: boolean
  isLoadingRuntimes: boolean
  isLoadingRuns: boolean
  isResolvingApproval: boolean
  error: string | null
  initialize: () => Promise<void>
  refreshRuntimes: () => Promise<void>
  loadConfig: (runtimeId: string) => Promise<void>
  saveConfig: (runtimeId: string, config: ExternalRuntimeConfig) => Promise<void>
  refreshHealth: (runtimeId: string) => Promise<ExternalRuntimeHealthStatus | null>
  loadRuns: (chatId?: string, runtimeId?: string) => Promise<void>
  refreshRun: (runtimeId: string, runId: string) => Promise<void>
  approveRequest: (
    runtimeId: string,
    approvalId: string,
    scope: ExternalRuntimeApprovalScope
  ) => Promise<void>
  denyRequest: (runtimeId: string, approvalId: string) => Promise<void>
  clearError: () => void
  getRun: (runtimeId: string, runId: string) => ExternalRuntimeStoredRun | undefined
}

let listenerCleanupRegistered = false
let listenerCleanups: Array<() => void> = []

function mergeRun(
  existing: ExternalRuntimeStoredRun | undefined,
  incoming: ExternalRuntimeStoredRun
): ExternalRuntimeStoredRun {
  if (!existing) {
    return incoming
  }

  if ('stagedInputs' in existing && !('stagedInputs' in incoming)) {
    return {
      ...existing,
      ...incoming
    } satisfies ExternalRuntimeRunResult
  }

  return {
    ...existing,
    ...incoming
  } as ExternalRuntimeStoredRun
}

function updateRunFromEvent(
  run: ExternalRuntimeStoredRun | undefined,
  event: ExternalRuntimeEvent
): ExternalRuntimeStoredRun | undefined {
  if (!run) {
    return run
  }

  const nextRun = {
    ...run,
    updatedAt: event.createdAt,
    ...(event.status ? { status: event.status } : {})
  } as ExternalRuntimeStoredRun

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

export const useExternalRuntimeStore = create<ExternalRuntimeState>((set, get) => ({
  descriptors: [],
  configs: {},
  healthByRuntime: {},
  runs: {},
  runEvents: {},
  approvalRequests: [],
  loadingConfigByRuntime: {},
  loadingHealthByRuntime: {},
  isInitialized: false,
  isLoadingRuntimes: false,
  isLoadingRuns: false,
  isResolvingApproval: false,
  error: null,

  initialize: async () => {
    if (!listenerCleanupRegistered) {
      listenerCleanupRegistered = true
      listenerCleanups = [
        window.ctg.externalRuntimes.onRunEvent((event) => {
          const runKey = getRunKey(event.runtimeId, event.runId)
          const hasKnownRun = Boolean(get().runs[runKey])

          set((state) => {
            const existingRun = state.runs[runKey]
            const nextEvents = [...(state.runEvents[runKey] || []), event].slice(-200)
            return {
              approvalRequests: isTerminalStatus(event.status)
                ? state.approvalRequests.filter(
                    (request) =>
                      !(request.runtimeId === event.runtimeId && request.runId === event.runId)
                  )
                : state.approvalRequests,
              runEvents: {
                ...state.runEvents,
                [runKey]: nextEvents
              },
              runs: {
                ...state.runs,
                ...(existingRun
                  ? { [runKey]: updateRunFromEvent(existingRun, event) as ExternalRuntimeStoredRun }
                  : {})
              }
            }
          })

          if (!hasKnownRun) {
            void get().refreshRun(event.runtimeId, event.runId)
          }
        }),
        window.ctg.externalRuntimes.onApprovalRequest((request) => {
          const runKey = getRunKey(request.runtimeId, request.runId)
          const hasKnownRun = Boolean(get().runs[runKey])

          set((state) => ({
            approvalRequests: state.approvalRequests.some(
              (existing) => existing.approvalId === request.approvalId
            )
              ? state.approvalRequests
              : [...state.approvalRequests, request]
          }))

          if (!hasKnownRun) {
            void get().refreshRun(request.runtimeId, request.runId)
          }
        }),
        window.ctg.externalRuntimes.onHealthUpdated((status) => {
          set((state) => ({
            healthByRuntime: {
              ...state.healthByRuntime,
              [status.runtimeId]: status
            }
          }))
        })
      ]
    }

    if (get().isInitialized) {
      return
    }

    set({ isInitialized: true })
    await get().refreshRuntimes()
  },

  refreshRuntimes: async () => {
    set({ isLoadingRuntimes: true, error: null })
    try {
      const descriptors = await window.ctg.externalRuntimes.listRuntimes()

      set({
        descriptors,
        isLoadingRuntimes: false
      })

      await Promise.all(
        descriptors.map(async (descriptor) => {
          await Promise.allSettled([
            get().loadConfig(descriptor.id),
            get().refreshHealth(descriptor.id)
          ])
        })
      )
    } catch (error) {
      set({
        isLoadingRuntimes: false,
        error: error instanceof Error ? error.message : 'Failed to load external runtimes.'
      })
    }
  },

  loadConfig: async (runtimeId) => {
    set((state) => ({
      loadingConfigByRuntime: {
        ...state.loadingConfigByRuntime,
        [runtimeId]: true
      },
      error: null
    }))

    try {
      const config = await window.ctg.externalRuntimes.getConfig(runtimeId)
      set((state) => ({
        configs: {
          ...state.configs,
          [runtimeId]: config
        },
        loadingConfigByRuntime: {
          ...state.loadingConfigByRuntime,
          [runtimeId]: false
        }
      }))
    } catch (error) {
      set((state) => ({
        loadingConfigByRuntime: {
          ...state.loadingConfigByRuntime,
          [runtimeId]: false
        },
        error: error instanceof Error ? error.message : `Failed to load ${runtimeId} configuration.`
      }))
    }
  },

  saveConfig: async (runtimeId, config) => {
    set((state) => ({
      loadingConfigByRuntime: {
        ...state.loadingConfigByRuntime,
        [runtimeId]: true
      },
      loadingHealthByRuntime: {
        ...state.loadingHealthByRuntime,
        [runtimeId]: true
      },
      error: null
    }))

    try {
      await window.ctg.externalRuntimes.setConfig(runtimeId, config)
      const [nextConfig, nextHealth] = await Promise.all([
        window.ctg.externalRuntimes.getConfig(runtimeId),
        window.ctg.externalRuntimes.getHealth(runtimeId)
      ])

      set((state) => ({
        configs: {
          ...state.configs,
          [runtimeId]: nextConfig
        },
        healthByRuntime: {
          ...state.healthByRuntime,
          [runtimeId]: nextHealth
        },
        loadingConfigByRuntime: {
          ...state.loadingConfigByRuntime,
          [runtimeId]: false
        },
        loadingHealthByRuntime: {
          ...state.loadingHealthByRuntime,
          [runtimeId]: false
        }
      }))
    } catch (error) {
      set((state) => ({
        loadingConfigByRuntime: {
          ...state.loadingConfigByRuntime,
          [runtimeId]: false
        },
        loadingHealthByRuntime: {
          ...state.loadingHealthByRuntime,
          [runtimeId]: false
        },
        error: error instanceof Error ? error.message : `Failed to save ${runtimeId} configuration.`
      }))
      throw error
    }
  },

  refreshHealth: async (runtimeId) => {
    set((state) => ({
      loadingHealthByRuntime: {
        ...state.loadingHealthByRuntime,
        [runtimeId]: true
      },
      error: null
    }))

    try {
      const health = await window.ctg.externalRuntimes.getHealth(runtimeId)
      set((state) => ({
        healthByRuntime: {
          ...state.healthByRuntime,
          [runtimeId]: health
        },
        loadingHealthByRuntime: {
          ...state.loadingHealthByRuntime,
          [runtimeId]: false
        }
      }))
      return health
    } catch (error) {
      set((state) => ({
        loadingHealthByRuntime: {
          ...state.loadingHealthByRuntime,
          [runtimeId]: false
        },
        error: error instanceof Error ? error.message : `Failed to refresh ${runtimeId} health.`
      }))
      return null
    }
  },

  loadRuns: async (chatId, runtimeId) => {
    set({ isLoadingRuns: true, error: null })
    try {
      const runs = await window.ctg.externalRuntimes.listRuns({ chatId, runtimeId })
      set((state) => {
        const nextRuns = { ...state.runs }
        runs.forEach((run) => {
          const runKey = getRunKey(run.runtimeId, run.runId)
          nextRuns[runKey] = mergeRun(nextRuns[runKey], run)
        })
        return {
          runs: nextRuns,
          isLoadingRuns: false
        }
      })
    } catch (error) {
      set({
        isLoadingRuns: false,
        error: error instanceof Error ? error.message : 'Failed to load external runtime runs.'
      })
    }
  },

  refreshRun: async (runtimeId, runId) => {
    try {
      const run = await window.ctg.externalRuntimes.getRun(runtimeId, runId)
      if (!run) {
        return
      }

      const runKey = getRunKey(runtimeId, runId)
      set((state) => ({
        runs: {
          ...state.runs,
          [runKey]: mergeRun(state.runs[runKey], run)
        }
      }))
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : `Failed to refresh ${runtimeId} run ${runId}.`
      })
    }
  },

  approveRequest: async (runtimeId, approvalId, scope) => {
    set({ isResolvingApproval: true, error: null })
    try {
      await window.ctg.externalRuntimes.approveRequest({
        runtimeId,
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
        error: error instanceof Error ? error.message : 'Failed to approve the runtime request.'
      })
      throw error
    }
  },

  denyRequest: async (runtimeId, approvalId) => {
    set({ isResolvingApproval: true, error: null })
    try {
      await window.ctg.externalRuntimes.denyRequest(runtimeId, approvalId)
      set((state) => ({
        approvalRequests: state.approvalRequests.filter(
          (request) => request.approvalId !== approvalId
        ),
        isResolvingApproval: false
      }))
    } catch (error) {
      set({
        isResolvingApproval: false,
        error: error instanceof Error ? error.message : 'Failed to deny the runtime request.'
      })
      throw error
    }
  },

  clearError: () => {
    set({ error: null })
  },

  getRun: (runtimeId, runId) => {
    return get().runs[getRunKey(runtimeId, runId)]
  }
}))

export function disposeExternalRuntimeStoreListeners(): void {
  listenerCleanups.forEach((cleanup) => cleanup())
  listenerCleanups = []
  listenerCleanupRegistered = false
}

export { getRunKey as getExternalRuntimeRunKey }
