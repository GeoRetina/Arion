import { describe, expect, it } from 'vitest'
import { parseCodexLoginStatus } from './codex-health-service'

describe('parseCodexLoginStatus', () => {
  it('treats successful JSON auth output as authenticated', () => {
    expect(parseCodexLoginStatus('{"account":{"authenticated":true}}', 0)).toEqual({
      authState: 'authenticated',
      message: '{"account":{"authenticated":true}}'
    })
  })

  it('treats a zero-exit auth probe with no markers as authenticated', () => {
    expect(parseCodexLoginStatus('', 0)).toEqual({
      authState: 'authenticated',
      message: 'Codex CLI is authenticated.'
    })
  })

  it('treats login-required output as unauthenticated', () => {
    expect(parseCodexLoginStatus('Authentication required. Run `codex login`.', 1)).toEqual({
      authState: 'unauthenticated',
      message: 'Authentication required. Run `codex login`.'
    })
  })
})
