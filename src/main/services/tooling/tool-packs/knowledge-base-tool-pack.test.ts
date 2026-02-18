import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceMemoryToolName } from '../../../llm-tools/knowledge-base-tools/create-workspace-memory-tool'
import { getWorkspaceMemoryToolName } from '../../../llm-tools/knowledge-base-tools/get-workspace-memory-tool'
import { queryKnowledgeBaseToolName } from '../../../llm-tools/knowledge-base-tools/query-knowledge-base-tool'
import { searchWorkspaceMemoriesToolName } from '../../../llm-tools/knowledge-base-tools/search-workspace-memories-tool'
import { registerKnowledgeBaseTools } from './knowledge-base-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<
    string,
    {
      execute: (params: {
        args: unknown
        chatId?: string
        sourceIdPrefix?: string
      }) => Promise<unknown>
    }
  >
} {
  const entries = new Map<
    string,
    {
      execute: (params: {
        args: unknown
        chatId?: string
        sourceIdPrefix?: string
      }) => Promise<unknown>
    }
  >()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: {
          args: unknown
          chatId?: string
          sourceIdPrefix?: string
        }) => Promise<unknown>
      }) => {
        entries.set(tool.name, { execute: tool.execute })
      }
    } as never,
    entries
  }
}

describe('registerKnowledgeBaseTools', () => {
  it('returns error when service is unavailable', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, { getKnowledgeBaseService: () => null })

    const tool = entries.get(queryKnowledgeBaseToolName)
    const result = (await tool?.execute({
      args: { query: 'roads' }
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('not configured')
  })

  it('returns contextual snippets when matches exist', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          embedText: vi.fn(async () => [0.1, 0.2]),
          findSimilarChunks: vi.fn(async () => [
            { id: 'chunk-1', document_id: 'doc-1', content: 'Road network info' }
          ])
        }) as never
    })

    const tool = entries.get(queryKnowledgeBaseToolName)
    const result = (await tool?.execute({
      args: { query: 'road data' }
    })) as { status: string; message: string; retrieved_context: string }

    expect(result.status).toBe('success')
    expect(result.message).toContain('Found 1 relevant context snippets')
    expect(result.retrieved_context).toContain('Road network info')
  })

  it('returns no_results when no chunks are found', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          embedText: vi.fn(async () => [0.1, 0.2]),
          findSimilarChunks: vi.fn(async () => [])
        }) as never
    })

    const tool = entries.get(queryKnowledgeBaseToolName)
    const result = (await tool?.execute({
      args: { query: 'missing topic' }
    })) as { status: string; message: string }

    expect(result).toEqual({
      status: 'no_results',
      message: 'No relevant information found in the knowledge base for your query.'
    })
  })

  it('returns error when query processing fails', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          embedText: vi.fn(async () => {
            throw new Error('embedding failure')
          })
        }) as never
    })

    const tool = entries.get(queryKnowledgeBaseToolName)
    const result = (await tool?.execute({
      args: { query: 'roads' }
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('embedding failure')
  })

  it('returns memory search results when matches exist', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          findRelevantWorkspaceMemories: vi.fn(async () => [
            {
              id: 'memory-1',
              summary: 'User decided to prioritize traffic risk modeling.',
              scope: 'global',
              memoryType: 'session_outcome',
              createdAt: '2026-01-01T00:00:00.000Z',
              finalScore: 0.91
            }
          ])
        }) as never
    })

    const tool = entries.get(searchWorkspaceMemoriesToolName)
    const result = (await tool?.execute({
      args: { query: 'What did we decide about traffic modeling?' },
      chatId: 'chat-1'
    })) as {
      status: string
      message: string
      results?: Array<{ id: string; source: string }>
    }

    expect(result.status).toBe('success')
    expect(result.message).toContain('Found 1 relevant workspace memories')
    expect(result.results?.[0]?.id).toBe('memory-1')
    expect(result.results?.[0]?.source).toBe('workspace-memory:memory-1')
  })

  it('returns no_results for memory search with no matches', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          findRelevantWorkspaceMemories: vi.fn(async () => [])
        }) as never
    })

    const tool = entries.get(searchWorkspaceMemoriesToolName)
    const result = (await tool?.execute({
      args: { query: 'unknown memory' }
    })) as { status: string; message: string }

    expect(result).toEqual({
      status: 'no_results',
      message: 'No relevant workspace memories were found for this query.'
    })
  })

  it('returns memory details by id', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          getWorkspaceMemoryById: vi.fn(async () => ({
            id: 'memory-2',
            summary: 'Tool outcome about road segment extraction.',
            scope: 'global',
            memoryType: 'tool_outcome',
            createdAt: '2026-01-02T00:00:00.000Z',
            details: { toolName: 'extract_roads' }
          }))
        }) as never
    })

    const tool = entries.get(getWorkspaceMemoryToolName)
    const result = (await tool?.execute({
      args: { memoryId: 'memory-2' }
    })) as {
      status: string
      memory?: { id: string; details?: unknown; source?: string }
    }

    expect(result.status).toBe('success')
    expect(result.memory?.id).toBe('memory-2')
    expect(result.memory?.source).toBe('workspace-memory:memory-2')
    expect(result.memory?.details).toEqual({ toolName: 'extract_roads' })
  })

  it('returns not_found for missing memory id', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          getWorkspaceMemoryById: vi.fn(async () => null)
        }) as never
    })

    const tool = entries.get(getWorkspaceMemoryToolName)
    const result = (await tool?.execute({
      args: { memoryId: 'missing-memory' }
    })) as { status: string; message: string }

    expect(result.status).toBe('not_found')
    expect(result.message).toContain('missing-memory')
  })

  it('creates workspace memory entry explicitly', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          upsertWorkspaceMemoryEntry: vi.fn(async () => ({
            id: 'memory-3',
            summary: 'Remember to prioritize wildfire overlays in weekly reports.',
            scope: 'global',
            memoryType: 'session_outcome',
            createdAt: '2026-01-03T00:00:00.000Z'
          }))
        }) as never
    })

    const tool = entries.get(createWorkspaceMemoryToolName)
    const result = (await tool?.execute({
      args: {
        summary: 'Remember to prioritize wildfire overlays in weekly reports.',
        details: 'User said this should remain default unless requested otherwise.'
      },
      chatId: 'chat-2',
      sourceIdPrefix: 'test'
    })) as {
      status: string
      memory?: { id?: string; source?: string }
    }

    expect(result.status).toBe('success')
    expect(result.memory?.id).toBe('memory-3')
    expect(result.memory?.source).toBe('workspace-memory:memory-3')
  })

  it('returns error for empty summary when creating memory', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          upsertWorkspaceMemoryEntry: vi.fn(async () => null)
        }) as never
    })

    const tool = entries.get(createWorkspaceMemoryToolName)
    const result = (await tool?.execute({
      args: { summary: '   ' },
      chatId: 'chat-3'
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('summary')
  })

  it('returns error for chat-scoped memory creation without chat context', async () => {
    const { registry, entries } = createRegistry()
    registerKnowledgeBaseTools(registry, {
      getKnowledgeBaseService: () =>
        ({
          upsertWorkspaceMemoryEntry: vi.fn(async () => null)
        }) as never
    })

    const tool = entries.get(createWorkspaceMemoryToolName)
    const result = (await tool?.execute({
      args: {
        summary: 'Pin this setting for this chat only.',
        scope: 'chat'
      }
    })) as { status: string; message: string }

    expect(result.status).toBe('error')
    expect(result.message).toContain('active chat context')
  })
})
