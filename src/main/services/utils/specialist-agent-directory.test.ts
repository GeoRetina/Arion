import { describe, expect, it } from 'vitest'
import type { AgentDefinition } from '../../../shared/types/agent-types'
import {
  buildSpecialistAgentDirectory,
  buildSpecialistAgentHandle,
  formatSpecialistAgentDirectoryForPrompt,
  resolveSpecialistAgentReference
} from './specialist-agent-directory'

function createAgent(overrides: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: overrides.id || 'agent-1',
    name: overrides.name || 'Agent One',
    description: overrides.description || 'Helpful agent',
    type: overrides.type || 'user-defined',
    role: overrides.role || 'specialist',
    capabilities: overrides.capabilities || [
      {
        id: 'inspect',
        name: 'File inspection',
        description: 'Inspect files',
        tools: ['query_knowledge_base']
      }
    ],
    promptConfig: overrides.promptConfig || {
      coreModules: [],
      agentModules: []
    },
    modelConfig: overrides.modelConfig || {
      provider: 'openai',
      model: 'gpt-4.1'
    },
    toolAccess: overrides.toolAccess || ['query_knowledge_base'],
    memoryConfig: overrides.memoryConfig,
    relationships: overrides.relationships,
    createdAt: overrides.createdAt || '2026-03-23T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-23T00:00:00.000Z',
    createdBy: overrides.createdBy
  }
}

describe('specialist-agent-directory', () => {
  it('builds stable specialist handles with a readable prefix', () => {
    expect(buildSpecialistAgentHandle('File Inspector', '1234567890abcdef')).toBe(
      'file-inspector-12345678'
    )
  })

  it('filters orchestrators out of the prompt directory', () => {
    const entries = buildSpecialistAgentDirectory([
      createAgent({ id: 'orch-1', name: 'Orchestrator', role: 'orchestrator' }),
      createAgent({ id: 'spec-1', name: 'File Inspector' })
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('File Inspector')
    expect(entries[0].handle).toBe('file-inspector-spec-1')
  })

  it('omits the prompt section when no specialists exist', () => {
    expect(formatSpecialistAgentDirectoryForPrompt([])).toBe('')
    expect(
      formatSpecialistAgentDirectoryForPrompt([], {
        includeUnavailableMessage: true
      })
    ).toContain('No specialized agents are currently available')
  })

  it('formats a prompt section with exact handle guidance', () => {
    const entries = buildSpecialistAgentDirectory([
      createAgent({ id: 'spec-1', name: 'File Inspector' })
    ])

    const promptSection = formatSpecialistAgentDirectoryForPrompt(entries)

    expect(promptSection).toContain('AVAILABLE SPECIALIZED AGENTS')
    expect(promptSection).toContain('Handle: file-inspector-spec-1')
    expect(promptSection).toContain('Never invent agent handles')
  })

  it('resolves handles, readable base handles, ids, and exact names', () => {
    const entries = buildSpecialistAgentDirectory([
      createAgent({ id: 'spec-1', name: 'File Inspector' })
    ])

    expect(resolveSpecialistAgentReference('file-inspector-spec-1', entries)).toMatchObject({
      matchedBy: 'handle',
      entry: { id: 'spec-1' }
    })
    expect(resolveSpecialistAgentReference('file-inspector', entries)).toMatchObject({
      matchedBy: 'base-handle',
      entry: { id: 'spec-1' }
    })
    expect(resolveSpecialistAgentReference('spec-1', entries)).toMatchObject({
      matchedBy: 'id',
      entry: { id: 'spec-1' }
    })
    expect(resolveSpecialistAgentReference('File Inspector', entries)).toMatchObject({
      matchedBy: 'name',
      entry: { id: 'spec-1' }
    })
  })

  it('returns an ambiguity error for duplicate readable handles', () => {
    const entries = buildSpecialistAgentDirectory([
      createAgent({ id: 'spec-1', name: 'File Inspector' }),
      createAgent({ id: 'spec-2', name: 'File Inspector' })
    ])

    expect(resolveSpecialistAgentReference('file-inspector', entries)).toMatchObject({
      error: 'ambiguous'
    })
  })
})
