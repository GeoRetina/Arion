import { describe, expect, it } from 'vitest'
import { convertToOllamaChatMessages, convertToOllamaResponsesMessages } from './message-converters'

describe('convertToOllamaResponsesMessages', () => {
  it('converts mixed prompt roles into Ollama responses format', () => {
    const prompt = [
      { role: 'system', content: 'System instruction' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: 'BASE64IMAGE'
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: 'BASE64PDF',
            filename: 'doc.pdf'
          }
        ]
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'answer' },
          { type: 'reasoning', text: 'internal thought' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'query_db',
            input: { sql: 'select 1' }
          }
        ]
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            toolCallId: 'ignore',
            output: { type: 'text', value: 'ignore' }
          },
          { toolCallId: 'call-1', output: { type: 'json', value: { rows: 1 } } }
        ]
      }
    ] as never

    const { messages, warnings } = convertToOllamaResponsesMessages({
      prompt,
      systemMessageMode: 'system'
    })

    expect(warnings).toEqual([])
    expect(messages).toEqual([
      { role: 'system', content: 'System instruction' },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'hello' },
          { type: 'input_image', image_url: 'data:image/png;base64,BASE64IMAGE' },
          {
            type: 'input_file',
            filename: 'doc.pdf',
            file_data: 'data:application/pdf;base64,BASE64PDF'
          }
        ]
      },
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'query_db',
        arguments: '{"sql":"select 1"}'
      },
      {
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'answer' },
          { type: 'output_text', text: 'internal thought' }
        ]
      },
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: '{"rows":1}'
      }
    ])
  })

  it('emits warning when system messages are removed', () => {
    const { messages, warnings } = convertToOllamaResponsesMessages({
      prompt: [{ role: 'system', content: 'ignore me' }] as never,
      systemMessageMode: 'remove'
    })

    expect(messages).toEqual([])
    expect(warnings).toEqual([
      { type: 'other', message: 'system messages are removed for this model' }
    ])
  })

  it('throws for unsupported user file media type', () => {
    expect(() =>
      convertToOllamaResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'audio/wav',
                data: 'abc'
              }
            ]
          }
        ] as never,
        systemMessageMode: 'system'
      })
    ).toThrow('file part media type audio/wav')
  })
})

describe('convertToOllamaChatMessages', () => {
  it('converts prompt into Ollama chat format', () => {
    const prompt = [
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'hi there' }]
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'answer' },
          { type: 'reasoning', text: 'thoughts' },
          { type: 'tool-call', toolCallId: 'call-1', toolName: 'buffer', input: { distance: 5 } }
        ]
      },
      {
        role: 'tool',
        content: [{ toolCallId: 'call-1', output: { type: 'text', value: 'done' } }]
      }
    ] as never

    const messages = convertToOllamaChatMessages({ prompt, systemMessageMode: 'system' })

    expect(messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi there' },
      {
        role: 'assistant',
        content: 'answer',
        thinking: 'thoughts',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'buffer', arguments: { distance: 5 } }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call-1', content: 'done' }
    ])
  })

  it('supports multimodal user messages with images', () => {
    const messages = convertToOllamaChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'analyze' },
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: 'IMG'
            }
          ]
        }
      ] as never
    })

    expect(messages).toEqual([
      {
        role: 'user',
        content: 'analyze',
        images: ['IMG']
      }
    ])
  })
})
