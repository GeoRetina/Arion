import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges and deduplicates tailwind class names', () => {
    const shouldHide = false
    expect(cn('p-2', 'text-sm', shouldHide ? 'hidden' : undefined, 'p-4')).toBe('text-sm p-4')
  })

  it('handles conditional and undefined values', () => {
    expect(cn(undefined, null, 'font-medium', ['text-red-500'])).toBe('font-medium text-red-500')
  })
})
