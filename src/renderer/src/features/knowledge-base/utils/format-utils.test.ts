import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatBytes, formatDate, formatRelativeTime } from './format-utils'

describe('formatBytes', () => {
  it('formats byte values into readable units', () => {
    expect(formatBytes(0)).toBe('0 Bytes')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })

  it('normalizes negative decimal input to zero decimals', () => {
    expect(formatBytes(1536, -2)).toBe('2 KB')
  })
})

describe('formatDate', () => {
  it('formats dates using en-US short month format', () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe('Jan 15, 2026')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns minute/hour/day relative labels', () => {
    expect(formatRelativeTime(new Date('2026-02-17T11:59:20.000Z'))).toBe('Just now')
    expect(formatRelativeTime(new Date('2026-02-17T11:59:00.000Z'))).toBe('1 minute ago')
    expect(formatRelativeTime(new Date('2026-02-17T11:30:00.000Z'))).toBe('30 minutes ago')
    expect(formatRelativeTime(new Date('2026-02-17T11:00:00.000Z'))).toBe('1 hour ago')
    expect(formatRelativeTime(new Date('2026-02-17T09:00:00.000Z'))).toBe('3 hours ago')
    expect(formatRelativeTime(new Date('2026-02-16T11:00:00.000Z'))).toBe('Yesterday')
  })

  it('falls back to absolute date for older timestamps', () => {
    expect(formatRelativeTime(new Date(2026, 1, 1, 12, 0, 0))).toBe('Feb 1, 2026')
  })

  it('returns Unknown for invalid timestamps', () => {
    expect(formatRelativeTime(new Date('invalid-date'))).toBe('Unknown')
  })
})
