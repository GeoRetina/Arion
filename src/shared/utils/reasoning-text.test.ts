import { describe, expect, it } from 'vitest'
import {
  extractReasoningFromText,
  findReasoningTagBounds,
  splitReasoningText
} from './reasoning-text'

describe('findReasoningTagBounds', () => {
  it('finds the first supported reasoning tag case-insensitively', () => {
    const bounds = findReasoningTagBounds('Intro <ANALYSIS>hidden</ANALYSIS> outro')

    expect(bounds).toEqual({
      tag: 'analysis',
      openIdx: 6,
      closeIdx: 22
    })
  })

  it('returns null when no reasoning tag is present', () => {
    expect(findReasoningTagBounds('no tags here')).toBeNull()
  })
})

describe('splitReasoningText', () => {
  it('splits text with a closed reasoning tag', () => {
    const result = splitReasoningText('Before <reasoning>internal notes</reasoning> After')

    expect(result).toEqual({
      reasoningText: 'internal notes',
      contentText: 'Before  After',
      hasOpenTag: false,
      tagName: 'reasoning'
    })
  })

  it('handles an unclosed reasoning tag', () => {
    const result = splitReasoningText('Public<think>private notes')

    expect(result).toEqual({
      reasoningText: 'private notes',
      contentText: 'Public',
      hasOpenTag: true,
      tagName: 'think'
    })
  })

  it('extracts prefix-style reasoning blocks', () => {
    const result = splitReasoningText('Thinking: break it down first\n\nFinal answer')

    expect(result).toEqual({
      reasoningText: 'break it down first',
      contentText: 'Final answer',
      hasOpenTag: false
    })
  })
})

describe('extractReasoningFromText', () => {
  it('extracts reasoning from tags and trims remaining content', () => {
    const result = extractReasoningFromText('Lead <think>internal</think> Tail ')

    expect(result).toEqual({
      content: 'Lead  Tail',
      reasoningText: 'internal'
    })
  })

  it('returns original content when no reasoning is present', () => {
    expect(extractReasoningFromText('Plain response')).toEqual({
      content: 'Plain response'
    })
  })
})
