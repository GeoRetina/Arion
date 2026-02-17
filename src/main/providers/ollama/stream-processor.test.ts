import { describe, expect, it } from 'vitest'
import { OllamaStreamProcessor } from './stream-processor'

async function readAll<T>(reader: ReadableStreamDefaultReader<T>): Promise<T[]> {
  const chunks: T[] = []
  while (true) {
    const result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
  }
  return chunks
}

describe('OllamaStreamProcessor', () => {
  it('emits stream parts from successful parse chunks', async () => {
    const processor = new OllamaStreamProcessor({
      provider: 'ollama',
      url: () => 'http://localhost',
      headers: () => ({}),
      generateId: () => 'generated-call-id'
    })

    const stream = processor.createTransformStream([])
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    const writing = (async () => {
      await writer.write({
        success: true,
        value: {
          done: false,
          model: 'llama3.2',
          created_at: '2026-02-17T12:00:00.000Z',
          message: {
            role: 'assistant',
            content: 'Hello'
          }
        }
      } as never)

      await writer.write({
        success: true,
        value: {
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 11,
          eval_count: 5,
          message: {
            role: 'assistant',
            content: ' world',
            thinking: 'reasoning',
            tool_calls: [
              {
                function: {
                  name: 'query_db',
                  arguments: '{"sql":"select 1"}'
                }
              }
            ]
          }
        }
      } as never)

      await writer.close()
    })()

    const parts = await readAll(reader)
    await writing

    expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] })
    expect(parts[1]).toEqual({
      type: 'response-metadata',
      id: undefined,
      modelId: 'llama3.2',
      timestamp: new Date('2026-02-17T12:00:00.000Z')
    })
    expect(parts).toEqual(
      expect.arrayContaining([
        { type: 'text-start', id: expect.any(String) },
        { type: 'text-delta', id: expect.any(String), delta: 'Hello' },
        { type: 'text-delta', id: expect.any(String), delta: ' world' },
        { type: 'reasoning-start', id: expect.any(String) },
        { type: 'reasoning-delta', id: expect.any(String), delta: 'reasoning' },
        {
          type: 'tool-call',
          toolCallId: 'generated-call-id',
          toolName: 'query_db',
          input: '{"sql":"select 1"}',
          args: { sql: 'select 1' }
        },
        { type: 'text-end', id: expect.any(String) },
        { type: 'reasoning-end', id: expect.any(String) },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 11,
              noCache: 11,
              cacheRead: undefined,
              cacheWrite: undefined
            },
            outputTokens: {
              total: 5,
              text: 5,
              reasoning: undefined
            }
          },
          providerMetadata: { ollama: {} }
        }
      ])
    )
  })

  it('emits error part when parse result fails without recoverable objects', async () => {
    const processor = new OllamaStreamProcessor({
      provider: 'ollama',
      url: () => 'http://localhost',
      headers: () => ({})
    })

    const stream = processor.createTransformStream([])
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    const parseError = new Error('parse failed')

    const writing = (async () => {
      await writer.write({
        success: false,
        error: parseError
      } as never)

      await writer.close()
    })()

    const parts = await readAll(reader)
    await writing

    expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] })
    expect(parts[1]).toEqual({ type: 'error', error: parseError })
    expect(parts[parts.length - 1]).toEqual({
      type: 'finish',
      finishReason: { unified: 'other', raw: undefined },
      usage: {
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined
        }
      },
      providerMetadata: { ollama: {} }
    })
  })
})
