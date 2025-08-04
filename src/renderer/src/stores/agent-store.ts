import { create } from 'zustand'
import type {
  AgentDefinition,
  AgentRegistryEntry,
  CreateAgentParams,
  UpdateAgentParams
} from '@/../../shared/types/agent-types'

interface AgentState {
  // State
  agents: AgentRegistryEntry[]
  selectedAgentId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  loadAgents: () => Promise<void>
  getAgentById: (id: string) => Promise<AgentDefinition | null>
  createAgent: (agent: CreateAgentParams) => Promise<AgentDefinition | null>
  updateAgent: (id: string, updates: UpdateAgentParams) => Promise<AgentDefinition | null>
  deleteAgent: (id: string) => Promise<boolean>
  setSelectedAgentId: (id: string | null) => void
  resetError: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  agents: [],
  selectedAgentId: null,
  isLoading: false,
  error: null,

  // Actions
  loadAgents: async () => {
    set({ isLoading: true, error: null })

    try {
      const agents = await window.ctg.agents.getAll()
      set({ agents, isLoading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error loading agents'
      set({ error: errorMessage, isLoading: false })
    }
  },

  getAgentById: async (id: string) => {
    try {
      set({ isLoading: true, error: null })
      const agent = await window.ctg.agents.getById(id)
      set({ isLoading: false })
      return agent
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Unknown error loading agent ${id}`
      set({ error: errorMessage, isLoading: false })
      return null
    }
  },

  createAgent: async (agent: CreateAgentParams) => {
    try {
      set({ isLoading: true, error: null })
      const newAgent = await window.ctg.agents.create(agent)

      // Reload the agent list to include the new agent
      await get().loadAgents()

      return newAgent
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating agent'
      set({ error: errorMessage, isLoading: false })
      return null
    }
  },

  updateAgent: async (id: string, updates: UpdateAgentParams) => {
    try {
      set({ isLoading: true, error: null })
      const updatedAgent = await window.ctg.agents.update(id, updates)

      // Reload the agent list to reflect the changes
      await get().loadAgents()

      return updatedAgent
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Unknown error updating agent ${id}`
      set({ error: errorMessage, isLoading: false })
      return null
    }
  },

  deleteAgent: async (id: string) => {
    try {
      set({ isLoading: true, error: null })
      const success = await window.ctg.agents.delete(id)

      if (success) {
        // If we successfully deleted the selected agent, clear the selection
        if (get().selectedAgentId === id) {
          set({ selectedAgentId: null })
        }

        // Reload the agent list to reflect the deletion
        await get().loadAgents()
      }

      return success
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Unknown error deleting agent ${id}`
      set({ error: errorMessage, isLoading: false })
      return false
    }
  },

  setSelectedAgentId: (id: string | null) => {
    set({ selectedAgentId: id })
  },

  resetError: () => {
    set({ error: null })
  }
}))
