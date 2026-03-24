import type { AgentDefinition, AgentRegistryEntry } from '../../../shared/types/agent-types'
import { isOrchestratorAgent } from '../../../shared/utils/agent-utils'

const HANDLE_ID_SUFFIX_LENGTH = 8

export interface SpecialistAgentDirectoryEntry {
  id: string
  handle: string
  baseHandle: string
  name: string
  description: string
  capabilities: AgentDefinition['capabilities']
}

interface AgentRegistryLike {
  getAllAgents: () => Promise<AgentRegistryEntry[]>
  getAgentById: (id: string) => Promise<AgentDefinition | null>
}

export interface SpecialistAgentResolutionSuccess {
  entry: SpecialistAgentDirectoryEntry
  matchedBy: 'handle' | 'base-handle' | 'id' | 'name'
}

export interface SpecialistAgentResolutionFailure {
  error: 'not_found' | 'ambiguous'
  reference: string
  matches?: SpecialistAgentDirectoryEntry[]
}

export function buildSpecialistAgentHandle(name: string, id: string): string {
  const baseHandle = buildBaseHandle(name)
  const shortId = id.trim().slice(0, HANDLE_ID_SUFFIX_LENGTH).toLowerCase()

  return shortId ? `${baseHandle}-${shortId}` : baseHandle
}

export function buildSpecialistAgentDirectory(
  agents: AgentDefinition[]
): SpecialistAgentDirectoryEntry[] {
  return agents
    .filter((agent) => !isOrchestratorAgent(agent))
    .map((agent) => {
      const baseHandle = buildBaseHandle(agent.name)

      return {
        id: agent.id,
        handle: buildSpecialistAgentHandle(agent.name, agent.id),
        baseHandle,
        name: agent.name,
        description: agent.description || 'No description',
        capabilities: agent.capabilities
      }
    })
}

export async function loadSpecialistAgentDirectory(
  agentRegistryService: AgentRegistryLike
): Promise<SpecialistAgentDirectoryEntry[]> {
  const allAgents = await agentRegistryService.getAllAgents()
  if (!Array.isArray(allAgents) || allAgents.length === 0) {
    return []
  }

  const definitions = await Promise.all(
    allAgents.map(async (agentEntry) => agentRegistryService.getAgentById(agentEntry.id))
  )

  return buildSpecialistAgentDirectory(
    definitions.filter((agent): agent is AgentDefinition => agent !== null)
  )
}

export function formatSpecialistAgentDirectoryForPrompt(
  entries: SpecialistAgentDirectoryEntry[],
  options: { includeUnavailableMessage?: boolean } = {}
): string {
  if (entries.length === 0) {
    return options.includeUnavailableMessage
      ? 'No specialized agents are currently available. Do not invent specialized agents, handles, or IDs.'
      : ''
  }

  const lines = ['AVAILABLE SPECIALIZED AGENTS:', '']

  for (const entry of entries) {
    const capabilitiesList =
      entry.capabilities.length > 0
        ? entry.capabilities.map((capability) => `- ${capability.name}: ${capability.description}`)
        : ['- No capabilities listed']

    lines.push(`Agent: ${entry.name}`)
    lines.push(`Handle: ${entry.handle}`)
    lines.push(`Description: ${entry.description}`)
    lines.push('Capabilities:')
    lines.push(...capabilitiesList)
    lines.push('')
  }

  lines.push(
    'When delegating, use only the exact `agent_handle` values listed above. Never invent agent handles, agent names, or agent IDs.'
  )

  return lines.join('\n')
}

export function resolveSpecialistAgentReference(
  reference: string,
  entries: SpecialistAgentDirectoryEntry[]
): SpecialistAgentResolutionSuccess | SpecialistAgentResolutionFailure {
  const normalizedReference = reference.trim().toLowerCase()
  if (!normalizedReference) {
    return {
      error: 'not_found',
      reference
    }
  }

  const exactHandleMatch = entries.find(
    (entry) => entry.handle.toLowerCase() === normalizedReference
  )
  if (exactHandleMatch) {
    return { entry: exactHandleMatch, matchedBy: 'handle' }
  }

  const baseHandleMatches = entries.filter(
    (entry) => entry.baseHandle.toLowerCase() === normalizedReference
  )
  if (baseHandleMatches.length === 1) {
    return { entry: baseHandleMatches[0], matchedBy: 'base-handle' }
  }
  if (baseHandleMatches.length > 1) {
    return {
      error: 'ambiguous',
      reference,
      matches: baseHandleMatches
    }
  }

  const exactIdMatch = entries.find((entry) => entry.id.toLowerCase() === normalizedReference)
  if (exactIdMatch) {
    return { entry: exactIdMatch, matchedBy: 'id' }
  }

  const nameMatches = entries.filter(
    (entry) => entry.name.trim().toLowerCase() === normalizedReference
  )
  if (nameMatches.length === 1) {
    return { entry: nameMatches[0], matchedBy: 'name' }
  }
  if (nameMatches.length > 1) {
    return {
      error: 'ambiguous',
      reference,
      matches: nameMatches
    }
  }

  return {
    error: 'not_found',
    reference
  }
}

function buildBaseHandle(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'agent'
}
