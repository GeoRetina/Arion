import { describe, expect, it } from 'vitest'
import { OllamaRequestBuilder } from './request-builder'

describe('OllamaRequestBuilder', () => {
  it('builds request args from call options', async () => {
    const builder = new OllamaRequestBuilder()

    const result = await builder.buildRequest({
      modelId: 'llama3.2',
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }]
        }
      ],
      responseFormat: { type: 'json' },
      topP: 0.9,
      temperature: 0.2
    } as never)

    expect(result.args.model).toBe('llama3.2')
    expect(result.args.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(result.args.format).toBe('json')
    expect(result.args.top_p).toBe(0.9)
    expect(result.args.temperature).toBe(0.2)
    expect(result.warnings).toEqual([])
  })

  it('collects warnings for unsupported settings and unsupported tool types', async () => {
    const builder = new OllamaRequestBuilder()

    const result = await builder.buildRequest({
      modelId: 'llama3.2',
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }]
        }
      ],
      topK: 40,
      seed: 7,
      presencePenalty: 0.1,
      frequencyPenalty: 0.1,
      stopSequences: ['END'],
      tools: [
        { type: 'provider-defined', id: 'provider-only' },
        { type: 'function', name: 'query_db', description: 'Query database' }
      ],
      toolChoice: { type: 'tool', toolName: 'query_db' }
    } as never)

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { type: 'unsupported', feature: 'setting:topK' },
        { type: 'unsupported', feature: 'setting:seed' },
        { type: 'unsupported', feature: 'setting:presencePenalty' },
        { type: 'unsupported', feature: 'setting:frequencyPenalty' },
        { type: 'unsupported', feature: 'setting:stopSequences' },
        { type: 'unsupported', feature: 'tool:provider-defined' }
      ])
    )
    expect(result.args.tool_choice).toEqual({ type: 'function', name: 'query_db' })
    expect(result.args.tools).toHaveLength(1)
  })

  it('applies ollama provider options', async () => {
    const builder = new OllamaRequestBuilder()

    const result = await builder.buildRequest({
      modelId: 'llama3.2',
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }]
        }
      ],
      providerOptions: {
        ollama: {
          think: 'high',
          keep_alive: '5m',
          options: { num_ctx: 8192 }
        }
      }
    } as never)

    expect(result.args.think).toBe('high')
    expect(result.args.keep_alive).toBe('5m')
    expect(result.args.options).toEqual({ num_ctx: 8192 })
  })
})
