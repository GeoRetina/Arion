import { describe, expect, it } from 'vitest'
import { classifyCodexStderrLine } from './codex-app-server-client'

describe('classifyCodexStderrLine', () => {
  it('ignores structured non-error log lines', () => {
    expect(
      classifyCodexStderrLine('2026-03-09T12:00:00Z INFO codex_runtime: waiting for event')
    ).toBeNull()
  })

  it('ignores known benign error log lines', () => {
    expect(
      classifyCodexStderrLine(
        '2026-03-09T12:00:00Z ERROR codex_runtime: state db missing rollout path for thread'
      )
    ).toBeNull()
  })

  it('keeps plain stderr lines as actionable errors', () => {
    expect(classifyCodexStderrLine('permission denied')).toEqual({
      message: 'permission denied'
    })
  })
})
