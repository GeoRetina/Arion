import { describe, expect, it } from 'vitest'
import type { Message } from '../../../../../shared/ipc-types'
import { hydrateStoredMessage, serializeMessageParts } from './stored-message-hydration'

function createStoredMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'message-1',
    chat_id: 'chat-1',
    role: 'assistant',
    content: 'Plain text fallback',
    tool_calls: null,
    tool_call_id: null,
    orchestration: null,
    created_at: '2026-03-09T12:00:00.000Z',
    ...overrides
  }
}

describe('stored-message-hydration', () => {
  it('serializes and rehydrates structured message parts', () => {
    const parts = [
      { type: 'text', text: 'Summary' },
      {
        type: 'dynamic-tool',
        toolName: 'run_external_analysis',
        toolCallId: 'tool-1',
        state: 'output-available',
        output: { run_id: 'run-1', status: 'completed' }
      }
    ]

    const serialized = serializeMessageParts(parts)
    const hydrated = hydrateStoredMessage(
      createStoredMessage({
        content: 'Summary',
        tool_calls: serialized ?? null
      }),
      { hydrated: true }
    )

    expect(serialized).toContain('"version":1')
    expect(hydrated.parts).toEqual(parts)
    expect(hydrated.hydrated).toBe(true)
  })

  it('falls back to text content when no structured payload exists', () => {
    const hydrated = hydrateStoredMessage(createStoredMessage())

    expect(hydrated.parts).toEqual([{ type: 'text', text: 'Plain text fallback' }])
    expect(hydrated.content).toBe('Plain text fallback')
  })

  it('accepts legacy array payloads and restores orchestration metadata', () => {
    const hydrated = hydrateStoredMessage(
      createStoredMessage({
        role: 'data',
        content: '',
        tool_calls: JSON.stringify([{ type: 'text', text: 'Recovered from legacy payload' }]),
        orchestration: JSON.stringify({
          subtasks: [
            {
              id: 'task-1',
              description: 'Inspect data',
              requiredCapabilities: [],
              dependencies: [],
              status: 'completed'
            }
          ],
          agentsInvolved: ['orchestrator-1'],
          completionTime: 42
        })
      })
    )

    expect(hydrated.role).toBe('assistant')
    expect(hydrated.parts).toEqual([{ type: 'text', text: 'Recovered from legacy payload' }])
    expect(hydrated.orchestration).toEqual({
      subtasks: [
        {
          id: 'task-1',
          description: 'Inspect data',
          requiredCapabilities: [],
          dependencies: [],
          status: 'completed'
        }
      ],
      agentsInvolved: ['orchestrator-1'],
      completionTime: 42
    })
  })
})
