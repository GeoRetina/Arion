/**
 * Utility functions for agent tool management
 */

interface AgentCapabilityLike {
  tools?: unknown
}

export interface AgentLike {
  toolAccess?: unknown
  capabilities?: unknown
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function asCapabilityArray(value: unknown): AgentCapabilityLike[] {
  return Array.isArray(value)
    ? value.filter((item): item is AgentCapabilityLike => Boolean(item && typeof item === 'object'))
    : []
}

/**
 * Fetches all available tools from the main process (includes both builtin and MCP tools)
 * @returns Promise<string[]> Array of available tool names
 */
export async function fetchAvailableTools(): Promise<string[]> {
  try {
    const tools = await window.ctg.tools.getAllAvailable()
    return tools
  } catch (error) {
    console.error('Failed to load available tools:', error)
    return []
  }
}

/**
 * Gets tools that are already assigned to existing agents
 * @param agents Array of agent definitions
 * @returns Set<string> Set of assigned tool names
 */
export function getAssignedToolsFromAgents(agents: AgentLike[]): Set<string> {
  const assignedTools = new Set<string>()

  agents.forEach((agent) => {
    // Check for tools in agent.toolAccess
    asStringArray(agent?.toolAccess).forEach((tool) => assignedTools.add(tool))

    // Check for tools in capabilities
    asCapabilityArray(agent?.capabilities).forEach((capability) => {
      asStringArray(capability.tools).forEach((tool) => assignedTools.add(tool))
    })
  })

  return assignedTools
}

/**
 * Filters available tools to exclude already assigned ones
 * @param allTools Array of all available tools
 * @param assignedTools Set of assigned tools to exclude
 * @returns string[] Array of unassigned tools
 */
export function filterUnassignedTools(allTools: string[], assignedTools: Set<string>): string[] {
  return allTools.filter((tool) => !assignedTools.has(tool))
}

/**
 * Hook-like utility function that combines fetching and filtering tools
 * @param agents Array of agents to check for assigned tools
 * @returns Promise<string[]> Array of available unassigned tools
 */
export async function getAvailableUnassignedTools(agents: AgentLike[]): Promise<string[]> {
  const allTools = await fetchAvailableTools()
  const assignedTools = getAssignedToolsFromAgents(agents)
  return filterUnassignedTools(allTools, assignedTools)
}
