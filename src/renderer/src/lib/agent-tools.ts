/**
 * Utility functions for agent tool management
 */

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
export function getAssignedToolsFromAgents(agents: UnsafeAny[]): Set<string> {
  const assignedTools = new Set<string>()

  agents.forEach((agent) => {
    // Check for tools in agent.toolAccess
    if (agent?.toolAccess && Array.isArray(agent.toolAccess)) {
      agent.toolAccess.forEach((tool: string) => {
        assignedTools.add(tool)
      })
    }

    // Check for tools in capabilities
    if (agent?.capabilities && Array.isArray(agent.capabilities)) {
      agent.capabilities.forEach((capability: UnsafeAny) => {
        if (capability?.tools && Array.isArray(capability.tools)) {
          capability.tools.forEach((tool: string) => {
            assignedTools.add(tool)
          })
        }
      })
    }
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
export async function getAvailableUnassignedTools(agents: UnsafeAny[]): Promise<string[]> {
  const allTools = await fetchAvailableTools()
  const assignedTools = getAssignedToolsFromAgents(agents)
  return filterUnassignedTools(allTools, assignedTools)
}
