export const REASONING_TAGS = ['think', 'analysis', 'reasoning'] as const

export const REASONING_PREFIX_PATTERNS = [
  /^Thinking:([\s\S]*?)(?:\n\n|$)/i,
  /^Reasoning:([\s\S]*?)(?:\n\n|$)/i,
  /^\*\*Thinking:\*\*([\s\S]*?)(?:\n\n|$)/i
]

const REASONING_TAG_REGEX = new RegExp(`<(${REASONING_TAGS.join('|')})>([\\s\\S]*?)<\\/\\1>`, 'i')

export interface ReasoningTagBounds {
  tag: string
  openIdx: number
  closeIdx: number
}

export interface ReasoningSplit {
  reasoningText?: string
  contentText: string
  hasOpenTag: boolean
  tagName?: string
}

export function findReasoningTagBounds(text: string): ReasoningTagBounds | null {
  if (!text) return null
  const lower = text.toLowerCase()
  let chosenTag: string | null = null
  let openIdx = -1

  for (const tag of REASONING_TAGS) {
    const idx = lower.indexOf(`<${tag}>`)
    if (idx !== -1 && (openIdx === -1 || idx < openIdx)) {
      openIdx = idx
      chosenTag = tag
    }
  }

  if (!chosenTag || openIdx === -1) return null

  const closeIdx = lower.indexOf(`</${chosenTag}>`, openIdx + chosenTag.length + 2)
  return { tag: chosenTag, openIdx, closeIdx }
}

export function splitReasoningText(text: string): ReasoningSplit {
  if (!text) {
    return { contentText: '', hasOpenTag: false }
  }

  const tagBounds = findReasoningTagBounds(text)
  if (tagBounds) {
    const openTag = `<${tagBounds.tag}>`
    const closeTag = `</${tagBounds.tag}>`

    if (tagBounds.closeIdx === -1 || tagBounds.closeIdx < tagBounds.openIdx) {
      return {
        reasoningText: text.slice(tagBounds.openIdx + openTag.length).trim(),
        contentText: text.slice(0, tagBounds.openIdx),
        hasOpenTag: true,
        tagName: tagBounds.tag
      }
    }

    return {
      reasoningText: text.slice(tagBounds.openIdx + openTag.length, tagBounds.closeIdx).trim(),
      contentText:
        text.slice(0, tagBounds.openIdx) + text.slice(tagBounds.closeIdx + closeTag.length),
      hasOpenTag: false,
      tagName: tagBounds.tag
    }
  }

  for (const pattern of REASONING_PREFIX_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const reasoningText = (match[1] || '').trim()
      const contentText = text.replace(pattern, '')
      return {
        reasoningText,
        contentText,
        hasOpenTag: false
      }
    }
  }

  return { contentText: text, hasOpenTag: false }
}

export function extractReasoningFromText(text: string): {
  content: string
  reasoningText?: string
} {
  const match = text.match(REASONING_TAG_REGEX)
  if (match) {
    const reasoning = match[2].trim()
    const content = text.replace(REASONING_TAG_REGEX, '').trim()
    return { content, reasoningText: reasoning }
  }

  for (const pattern of REASONING_PREFIX_PATTERNS) {
    const prefixMatch = text.match(pattern)
    if (prefixMatch) {
      const reasoning = prefixMatch[1].trim()
      const content = text.replace(pattern, '').trim()
      return { content, reasoningText: reasoning }
    }
  }

  return { content: text }
}
