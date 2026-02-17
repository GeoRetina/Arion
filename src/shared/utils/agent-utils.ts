/**
 * Utility functions for agent operations
 */

/**
 * Check if an agent is an orchestrator based on its role
 *
 * @param agent The agent object to check
 * @returns boolean indicating if the agent is an orchestrator
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function isOrchestratorAgent(agent: unknown): boolean {
  const agentRecord = asRecord(agent)
  if (!agentRecord) return false

  // Primary check: look for the explicit role field
  if (agentRecord.role !== undefined) {
    return agentRecord.role === 'orchestrator'
  }

  // Fallback for backward compatibility: check capabilities if role is undefined
  if (Array.isArray(agentRecord.capabilities)) {
    return agentRecord.capabilities.some((capability) => {
      const capabilityRecord = asRecord(capability)
      const name = capabilityRecord?.name
      const description = capabilityRecord?.description
      return (
        (typeof name === 'string' && name.toLowerCase().includes('orchestrat')) ||
        (typeof description === 'string' && description.toLowerCase().includes('orchestrat'))
      )
    })
  }

  return false
}
