import { describe, expect, it, vi } from 'vitest'
import { queryKnowledgeBaseToolName } from '../../../llm-tools/knowledge-base-tools/query-knowledge-base-tool'
import { registerKnowledgeBaseTools } from './knowledge-base-tool-pack'

function createRegistry(): {
  registry: never
  entries: Map<string, { execute: (params: { args: unknown }) => Promise<unknown> }>
} {
  const entries = new Map<string, { execute: (params: { args: unknown }) => Promise<unknown> }>()
  return {
    registry: {
      register: (tool: {
        name: string
        execute: (params: { args: unknown }) => Promise<unknown>
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
})
