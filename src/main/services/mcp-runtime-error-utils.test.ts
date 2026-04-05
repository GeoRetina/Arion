import { describe, expect, it } from 'vitest'
import {
  appendMcpRuntimeDetail,
  normalizeMcpRuntimeDetail,
  summarizeMcpRuntimeFailure
} from './mcp-runtime-error-utils'

describe('mcp-runtime-error-utils', () => {
  it('prefers the last traceback line when the transport error is generic', () => {
    const detail = `
Traceback (most recent call last):
  File "E:\\Coding\\open-source\\Arion\\mcp-servers\\postgresql\\postgresql_server.py", line 15, in <module>
    import psycopg2
ModuleNotFoundError: No module named 'psycopg2'
    `

    expect(summarizeMcpRuntimeFailure(new Error('Connection closed'), detail)).toEqual({
      message: "ModuleNotFoundError: No module named 'psycopg2'",
      detail: `Traceback (most recent call last):
  File "E:\\Coding\\open-source\\Arion\\mcp-servers\\postgresql\\postgresql_server.py", line 15, in <module>
    import psycopg2
ModuleNotFoundError: No module named 'psycopg2'`
    })
  })

  it('keeps the original error message when it is already specific', () => {
    expect(summarizeMcpRuntimeFailure(new Error('spawn python ENOENT'))).toEqual({
      message: 'spawn python ENOENT',
      detail: undefined
    })
  })

  it('keeps only the newest diagnostic tail when stderr grows too large', () => {
    const appended = appendMcpRuntimeDetail('abcdef', 'ghijkl', 8)

    expect(appended).toBe('efghijkl')
  })

  it('normalizes whitespace-only diagnostic output to undefined', () => {
    expect(normalizeMcpRuntimeDetail(' \r\n\t ')).toBeUndefined()
  })
})
