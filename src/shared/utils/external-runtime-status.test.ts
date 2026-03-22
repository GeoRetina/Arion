import { describe, expect, it } from 'vitest'
import {
  isExternalRuntimeInProgressStatus,
  isExternalRuntimeRunStatus,
  isExternalRuntimeTerminalStatus
} from './external-runtime-status'
import {
  normalizeExternalRuntimeId,
  resolveRegisteredExternalRuntimeId
} from './external-runtime-config'

describe('external runtime shared helpers', () => {
  it('classifies valid runtime statuses', () => {
    expect(isExternalRuntimeRunStatus('queued')).toBe(true)
    expect(isExternalRuntimeRunStatus('running')).toBe(true)
    expect(isExternalRuntimeRunStatus('completed')).toBe(true)
    expect(isExternalRuntimeRunStatus('bogus')).toBe(false)
  })

  it('classifies in-progress and terminal statuses consistently', () => {
    expect(isExternalRuntimeInProgressStatus('queued')).toBe(true)
    expect(isExternalRuntimeInProgressStatus('awaiting-approval')).toBe(true)
    expect(isExternalRuntimeInProgressStatus('completed')).toBe(false)
    expect(isExternalRuntimeInProgressStatus(undefined)).toBe(false)

    expect(isExternalRuntimeTerminalStatus('completed')).toBe(true)
    expect(isExternalRuntimeTerminalStatus('failed')).toBe(true)
    expect(isExternalRuntimeTerminalStatus('running')).toBe(false)
    expect(isExternalRuntimeTerminalStatus(undefined)).toBe(false)
  })

  it('normalizes and resolves registered runtime ids', () => {
    const runtimes = [{ id: 'codex' }, { id: 'claude-code' }]

    expect(normalizeExternalRuntimeId(' codex ')).toBe('codex')
    expect(normalizeExternalRuntimeId('   ')).toBeNull()
    expect(resolveRegisteredExternalRuntimeId(' codex ', runtimes)).toBe('codex')
    expect(resolveRegisteredExternalRuntimeId('unknown', runtimes)).toBeNull()
  })
})
