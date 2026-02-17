/**
 * Utility functions for agent operations
 */

/**
 * Check if an agent is an orchestrator based on its role
 *
 * @param agent The agent object to check
 * @returns boolean indicating if the agent is an orchestrator
 */
export function isOrchestratorAgent(agent: UnsafeAny): boolean {
  if (!agent) return false

  // Primary check: look for the explicit role field
  if (agent.role !== undefined) {
    return agent.role === 'orchestrator'
  }

  // Fallback for backward compatibility: check capabilities if role is undefined
  if (Array.isArray(agent.capabilities)) {
    return agent.capabilities.some(
      (cap: UnsafeAny) =>
        cap.name?.toLowerCase?.()?.includes('orchestrat') ||
        cap.description?.toLowerCase?.()?.includes('orchestrat')
    )
  }

  return false
}
