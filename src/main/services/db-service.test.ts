import { afterEach, describe, expect, it, vi } from 'vitest'

type MockStoredMessage = {
  id: string
  chat_id: string
  role: 'system' | 'user' | 'assistant' | 'function' | 'data' | 'tool'
  content: string
  name?: string | null
  tool_calls?: string | null
  tool_call_id?: string | null
  orchestration?: string | null
  created_at: string
}

const mocks = vi.hoisted(() => {
  let storedMessage: MockStoredMessage | null = null
  let lastMessageInsertSql = ''
  let lastMessageInsertParams: Record<string, unknown> | null = null
  let lastMessageListSql = ''

  const prepare = vi.fn((sql: string) => {
    if (sql.includes("pragma_table_info('messages')")) {
      return {
        get: () => ({ count: 1 })
      }
    }

    if (sql === 'SELECT * FROM messages WHERE id = ?') {
      return {
        get: (id: string) => (storedMessage?.id === id ? storedMessage : null)
      }
    }

    if (sql.startsWith('INSERT INTO messages')) {
      lastMessageInsertSql = sql
      return {
        run: (params: Record<string, unknown>) => {
          lastMessageInsertParams = params
          storedMessage = {
            id: String(params.id),
            chat_id: String(params.chat_id),
            role: params.role as MockStoredMessage['role'],
            content: String(params.content),
            name: (params.name as string | null | undefined) ?? null,
            tool_calls: (params.tool_calls as string | null | undefined) ?? null,
            tool_call_id: (params.tool_call_id as string | null | undefined) ?? null,
            orchestration: (params.orchestration as string | null | undefined) ?? null,
            created_at:
              (params.created_at as string | null | undefined) ?? '2026-03-09T12:00:00.000Z'
          }
          return { changes: 1 }
        }
      }
    }

    if (sql.startsWith('SELECT * FROM messages WHERE chat_id = ?')) {
      lastMessageListSql = sql
      return {
        all: () => []
      }
    }

    if (sql === 'SELECT * FROM chats WHERE id = ?') {
      return {
        get: () => null
      }
    }

    if (sql.startsWith('INSERT INTO chats')) {
      return {
        run: () => ({ changes: 1 })
      }
    }

    return {
      run: () => ({ changes: 0 }),
      get: () => null,
      all: () => []
    }
  })

  return {
    getDbConstructor: () =>
      vi.fn(function DatabaseMock() {
        return {
          exec: vi.fn(),
          prepare,
          transaction: (callback: () => void) => callback,
          close: vi.fn(),
          open: true
        }
      }),
    reset: () => {
      storedMessage = null
      lastMessageInsertSql = ''
      lastMessageInsertParams = null
      lastMessageListSql = ''
      prepare.mockClear()
    },
    getLastMessageInsertSql: () => lastMessageInsertSql,
    getLastMessageInsertParams: () => lastMessageInsertParams,
    getLastMessageListSql: () => lastMessageListSql
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/mock-user-data',
    on: vi.fn()
  }
}))

vi.mock('better-sqlite3', () => ({
  default: mocks.getDbConstructor()
}))

import { DBService } from './db-service'

describe('DBService message timestamps', () => {
  afterEach(() => {
    mocks.reset()
    ;(DBService as unknown as { instance?: DBService }).instance = undefined
  })

  it('normalizes provided message timestamps and falls back to ISO storage defaults', () => {
    const dbService = DBService.getInstance()

    const insertedMessage = dbService.addMessage({
      id: 'message-1',
      chat_id: 'chat-1',
      role: 'user',
      content: 'Hello there',
      created_at: '2026-03-09T12:00:00.500Z'
    })

    expect(mocks.getLastMessageInsertSql()).toContain("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    expect(mocks.getLastMessageInsertParams()).toMatchObject({
      created_at: '2026-03-09T12:00:00.500Z'
    })
    expect(insertedMessage?.created_at).toBe('2026-03-09T12:00:00.500Z')

    dbService.addMessage({
      id: 'message-2',
      chat_id: 'chat-1',
      role: 'assistant',
      content: 'Invalid timestamp should be ignored.',
      created_at: 'not-a-real-timestamp'
    })

    expect(mocks.getLastMessageInsertParams()).toMatchObject({
      created_at: null
    })
  })

  it('orders message history using chronological datetime parsing', () => {
    const dbService = DBService.getInstance()

    dbService.getMessagesByChatId('chat-1')

    expect(mocks.getLastMessageListSql()).toBe(
      'SELECT * FROM messages WHERE chat_id = ? ORDER BY julianday(created_at) ASC, created_at ASC'
    )
  })
})
