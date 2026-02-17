import { create } from 'zustand'
import { Subtask, AgentCapabilitiesResult, OrchestrationStatus } from '../../../shared/ipc-types'
import type { AgentDisplayInfo } from '../features/chat/components/agent-indicator'

export interface AgentOrchestrationState {
  // Orchestration is always available
  // No need to select an orchestrator agent directly

  // Active orchestration session
  activeSessionId: string | null
  setActiveSessionId: (sessionId: string | null) => void

  // Subtasks for the active session
  subtasks: Subtask[]
  setSubtasks: (subtasks: Subtask[]) => void
  updateSubtaskStatus: (subtaskId: string, status: Subtask['status']) => void

  // Agents involved in orchestration
  agentsInvolved: AgentDisplayInfo[]
  setAgentsInvolved: (agents: AgentDisplayInfo[]) => void
  updateAgentStatus: (agentId: string, isActive: boolean) => void

  // Agent capabilities
  capabilities: AgentCapabilitiesResult['capabilities']
  setCapabilities: (capabilities: AgentCapabilitiesResult['capabilities']) => void

  // Orchestration status
  isOrchestrating: boolean
  setIsOrchestrating: (isOrchestrating: boolean) => void

  // Error handling
  error: string | null
  setError: (error: string | null) => void

  // Initialization
  initialized: boolean
  setInitialized: (initialized: boolean) => void
  initialize: () => Promise<void>

  // Actions
  startOrchestration: (chatId: string, message: string, orchestratorId?: string) => Promise<string>
  updateOrchestrationStatus: () => Promise<OrchestrationStatus | null>
  resetOrchestration: () => void
}

export const useAgentOrchestrationStore = create<AgentOrchestrationState>((set, get) => ({
  // Orchestration is handled automatically based on the selected model

  // Active orchestration session
  activeSessionId: null,
  setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),

  // Subtasks for the active session
  subtasks: [],
  setSubtasks: (subtasks) => set({ subtasks }),
  updateSubtaskStatus: (subtaskId, status) =>
    set((state) => ({
      subtasks: state.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, status } : subtask
      )
    })),

  // Agents involved in orchestration
  agentsInvolved: [],
  setAgentsInvolved: (agents) => set({ agentsInvolved: agents }),
  updateAgentStatus: (agentId, isActive) =>
    set((state) => ({
      agentsInvolved: state.agentsInvolved.map((agent) =>
        agent.id === agentId ? { ...agent, isActive } : agent
      )
    })),

  // Agent capabilities
  capabilities: [],
  setCapabilities: (capabilities) => set({ capabilities }),

  // Orchestration status
  isOrchestrating: false,
  setIsOrchestrating: (isOrchestrating) => set({ isOrchestrating }),

  // Error handling
  error: null,
  setError: (error) => set({ error }),

  // Initialization
  initialized: false,
  setInitialized: (initialized) => set({ initialized }),

  // Initialize the store
  initialize: async () => {
    if (get().initialized) return

    try {
      // Get agent capabilities
      if (window.ctg?.agents?.getCapabilities) {
        const capabilitiesResult = await window.ctg.agents.getCapabilities()

        if (capabilitiesResult.success) {
          set({ capabilities: capabilitiesResult.capabilities })
        } else {
          void 0
        }
      }

      // Get current orchestration status
      await get().updateOrchestrationStatus()

      set({ initialized: true })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error initializing orchestration',
        initialized: false
      })
    }
  },

  // Start a new orchestration session
  startOrchestration: async (chatId, message, orchestratorId) => {
    set({ isOrchestrating: true, error: null })

    try {
      if (window.ctg?.orchestration?.orchestrateMessage) {
        const result = await window.ctg.orchestration.orchestrateMessage(
          chatId,
          message,
          orchestratorId || ''
        )

        if (result.success) {
          set({
            activeSessionId: result.sessionId,
            subtasks: result.subtasks || [],
            isOrchestrating: false
          })

          // Convert agents involved to AgentDisplayInfo
          if (result.agentsInvolved) {
            // TODO: Fetch agent details from registry to get types and capabilities
            const agentDisplayInfo: AgentDisplayInfo[] = result.agentsInvolved.map((agentId) => ({
              id: agentId,
              name: agentId, // This should be updated with the actual agent name
              type: agentId === orchestratorId ? 'orchestrator' : 'specialized',
              isActive: false,
              capabilities: []
            }))

            set({ agentsInvolved: agentDisplayInfo })
          }

          return result.finalResponse || ''
        } else {
          throw new Error(result.error || 'Unknown orchestration error')
        }
      } else if (window.ctg?.agents?.orchestrateMessage) {
        const result = await window.ctg.agents.orchestrateMessage(
          chatId,
          message,
          orchestratorId || ''
        )

        if (result.success) {
          set({
            activeSessionId: result.sessionId,
            subtasks: result.subtasks || [],
            isOrchestrating: false
          })

          // Convert agents involved to AgentDisplayInfo
          if (result.agentsInvolved) {
            // TODO: Fetch agent details from registry to get types and capabilities
            const agentDisplayInfo: AgentDisplayInfo[] = result.agentsInvolved.map((agentId) => ({
              id: agentId,
              name: agentId, // This should be updated with the actual agent name
              type: agentId === orchestratorId ? 'orchestrator' : 'specialized',
              isActive: false,
              capabilities: []
            }))

            set({ agentsInvolved: agentDisplayInfo })
          }

          return result.finalResponse || ''
        } else {
          throw new Error(result.error || 'Unknown orchestration error')
        }
      } else {
        throw new Error('Orchestration API not available')
      }
    } catch (error) {
      set({
        isOrchestrating: false,
        error: error instanceof Error ? error.message : 'Unknown orchestration error'
      })
      throw error
    }
  },

  // Update the status of the current orchestration session
  updateOrchestrationStatus: async () => {
    const { activeSessionId } = get()

    try {
      if (window.ctg?.orchestration?.getStatus) {
        const status = await window.ctg.orchestration.getStatus(activeSessionId || undefined)

        if (status.success) {
          if (activeSessionId && status.subtasks?.[activeSessionId]) {
            set({ subtasks: status.subtasks[activeSessionId] })
          }
          return status
        }
      }
      return null
    } catch {
      return null
    }
  },

  // Reset the orchestration state
  resetOrchestration: () => {
    set({
      activeSessionId: null,
      subtasks: [],
      agentsInvolved: [],
      isOrchestrating: false,
      error: null
    })
  }
}))

export default useAgentOrchestrationStore
