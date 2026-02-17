import { useState, useEffect, useMemo } from 'react'
import {
  type AgentLike,
  fetchAvailableTools,
  getAssignedToolsFromAgents,
  filterUnassignedTools
} from '@/lib/agent-tools'

/**
 * Hook for managing tools in agent creation/editing contexts
 * @param agents Array of existing agents to check for tool assignments
 * @param shouldFetch Whether to fetch tools (typically when modal is open)
 * @returns Object containing tool-related state and functions
 */
export function useAgentTools(
  agents: AgentLike[] = [],
  shouldFetch: boolean = true
): {
  allTools: string[]
  availableTools: string[]
  assignedTools: Set<string>
  isLoading: boolean
  error: string | null
  refreshTools: () => Promise<void>
} {
  const [allTools, setAllTools] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch all available tools when shouldFetch changes
  useEffect(() => {
    if (!shouldFetch) return

    setIsLoading(true)
    setError(null)

    fetchAvailableTools()
      .then((tools) => {
        setAllTools(tools)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch tools')
        setAllTools([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [shouldFetch])

  // Get assigned tools from agents
  const assignedTools = useMemo(() => {
    return getAssignedToolsFromAgents(agents)
  }, [agents])

  // Filter available tools to exclude assigned ones
  const availableTools = useMemo(() => {
    return filterUnassignedTools(allTools, assignedTools)
  }, [allTools, assignedTools])

  // Refresh tools manually
  const refreshTools = async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const tools = await fetchAvailableTools()
      setAllTools(tools)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh tools')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    allTools,
    availableTools,
    assignedTools,
    isLoading,
    error,
    refreshTools
  }
}
