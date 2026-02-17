import { describe, expect, it } from 'vitest'
import { prepareResponsesTools } from './tool-prep'

describe('prepareResponsesTools', () => {
  it('returns empty tool config when no tools are provided', () => {
    expect(prepareResponsesTools({ tools: undefined })).toEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: []
    })
  })

  it('maps function tools and preserves explicit tool choice', () => {
    const result = prepareResponsesTools({
      tools: [
        {
          type: 'function',
          name: 'buffer_tool',
          description: 'Buffers geometry',
          inputSchema: {
            type: 'object',
            properties: { distance: { type: 'number' } },
            required: ['distance']
          }
        }
      ] as never,
      toolChoice: { type: 'required' } as never
    })

    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'buffer_tool',
          description: 'Buffers geometry',
          parameters: {
            type: 'object',
            properties: { distance: { type: 'number' } },
            required: ['distance']
          }
        }
      }
    ])
    expect(result.toolChoice).toBe('required')
    expect(result.toolWarnings).toEqual([])
  })

  it('adds warning for unsupported tools and maps specific tool target', () => {
    const result = prepareResponsesTools({
      tools: [
        {
          type: 'function',
          name: 'query_db',
          description: 'Query db'
        },
        {
          type: 'provider-defined',
          id: 'x'
        }
      ] as never,
      toolChoice: { type: 'tool', toolName: 'query_db' } as never
    })

    expect(result.toolChoice).toEqual({ type: 'function', name: 'query_db' })
    expect(result.toolWarnings).toEqual([{ type: 'unsupported', feature: 'tool:provider-defined' }])
    expect(result.tools).toHaveLength(1)
  })

  it('maps web_search_preview tool choice', () => {
    const result = prepareResponsesTools({
      tools: [
        {
          type: 'function',
          name: 'web_search_preview',
          description: 'Search web'
        }
      ] as never,
      toolChoice: { type: 'tool', toolName: 'web_search_preview' } as never
    })

    expect(result.toolChoice).toEqual({ type: 'web_search_preview' })
  })
})
