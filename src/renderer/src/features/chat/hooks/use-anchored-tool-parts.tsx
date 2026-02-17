import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MessagePartRenderer } from '../components/message/message-part-renderer'
import type { MessagePart } from '../types/message-types'

type AnchoredMessage = {
  id: string
  role: string
  content?: string
  parts?: unknown[]
}

interface UseAnchoredToolPartsOptions {
  message: AnchoredMessage
  collapseReasoning: boolean
  isUser: boolean
}

const toolPartPrefix = 'tool-'

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function isTextPart(part: unknown): part is { type: 'text'; text: string } {
  const partRecord = asObject(part)
  return Boolean(partRecord && partRecord.type === 'text' && typeof partRecord.text === 'string')
}

const isToolPart = (part: unknown): boolean => {
  const partRecord = asObject(part)
  const partType = partRecord?.type
  return (
    typeof partType === 'string' &&
    (partType === 'tool-invocation' ||
      partType === 'dynamic-tool' ||
      partType.startsWith(toolPartPrefix))
  )
}

const getToolCallId = (part: unknown): string | undefined => {
  const partRecord = asObject(part)
  const toolInvocation = asObject(partRecord?.toolInvocation)
  const toolCallId = toolInvocation?.toolCallId ?? partRecord?.toolCallId ?? partRecord?.id
  return typeof toolCallId === 'string' ? toolCallId : undefined
}

export function useAnchoredToolParts({
  message,
  collapseReasoning,
  isUser
}: UseAnchoredToolPartsOptions): ReactNode[] | null {
  const toolAnchorRef = useRef<Record<string, number>>({})

  const textParts = useMemo(
    () => (Array.isArray(message.parts) ? message.parts.filter((p) => isTextPart(p)) : []),
    [message.parts]
  )

  const textContent = useMemo(
    () =>
      textParts.length > 0
        ? textParts.map((part) => part.text).join('')
        : typeof message.content === 'string'
          ? message.content
          : '',
    [textParts, message.content]
  )

  const toolParts = useMemo(
    () => (Array.isArray(message.parts) ? message.parts.filter((p) => isToolPart(p)) : []),
    [message.parts]
  )

  const textPartIndex = useMemo(
    () => (Array.isArray(message.parts) ? message.parts.findIndex((p) => isTextPart(p)) : -1),
    [message.parts]
  )

  const hasAnchoredToolFlow = useMemo(
    () => Boolean(textParts.length > 0 && toolParts.length > 0 && !isUser),
    [textParts, toolParts, isUser]
  )

  const resolveAnchor = useCallback(
    (toolCallId: string | undefined) => {
      if (toolCallId && toolAnchorRef.current[toolCallId] !== undefined) {
        return toolAnchorRef.current[toolCallId]
      }
      return textContent.length
    },
    [textContent.length]
  )

  const firstToolAnchor = useMemo(() => {
    if (!hasAnchoredToolFlow) return textContent.length
    return toolParts
      .map((part) => resolveAnchor(getToolCallId(part)))
      .reduce((min: number, val: number) => Math.min(min, val), textContent.length)
  }, [hasAnchoredToolFlow, resolveAnchor, textContent, toolParts])

  // Reset anchors when the message changes
  useEffect(() => {
    toolAnchorRef.current = {}
  }, [message.id])

  // Capture the text length when each tool call first appears to anchor later text below it
  useEffect(() => {
    if (!hasAnchoredToolFlow) return
    const currentLength = textContent.length
    toolParts.forEach((part) => {
      const id = getToolCallId(part)
      if (id && toolAnchorRef.current[id] === undefined) {
        toolAnchorRef.current[id] = currentLength
      }
    })
  }, [hasAnchoredToolFlow, textContent, toolParts])

  const parts = message.parts
  if (!Array.isArray(parts) || parts.length === 0 || isUser) {
    return null
  }

  if (!hasAnchoredToolFlow) {
    return parts.map((part, partIndex) => (
      <MessagePartRenderer
        key={`${message.id}-part-${partIndex}`}
        part={part as MessagePart}
        messageId={message.id}
        index={partIndex}
        collapseReasoning={collapseReasoning}
      />
    ))
  }

  const rendered: ReactNode[] = []
  let cursor = 0
  let syntheticIndex = 0

  const pushTextSlice = (slice: string, key: string): void => {
    if (!slice || slice.length === 0) return
    rendered.push(
      <MessagePartRenderer
        key={key}
        part={{ type: 'text', text: slice }}
        messageId={message.id}
        index={syntheticIndex++}
        collapseReasoning={collapseReasoning}
      />
    )
  }

  parts.forEach((part, partIndex) => {
    const partRecord = asObject(part)
    if (!partRecord) return
    if (partRecord.type === 'text') {
      // Text is handled via slices.
      return
    }

    if (isToolPart(part)) {
      const toolCallId = getToolCallId(part)
      const anchor = resolveAnchor(toolCallId) || 0

      if (cursor < anchor) {
        pushTextSlice(
          textContent.slice(cursor, anchor),
          `${message.id}-text-before-${toolCallId || partIndex}`
        )
        cursor = anchor
      }

      rendered.push(
        <MessagePartRenderer
          key={`${message.id}-part-${partIndex}`}
          part={part as MessagePart}
          messageId={message.id}
          index={partIndex}
          collapseReasoning={collapseReasoning}
        />
      )
      syntheticIndex = Math.max(syntheticIndex, partIndex + 1)
      return
    }

    // Other part types keep their natural order, but ensure leading text renders before them
    if (hasAnchoredToolFlow && cursor === 0 && textPartIndex >= 0 && partIndex > textPartIndex) {
      if (cursor < firstToolAnchor) {
        pushTextSlice(
          textContent.slice(cursor, firstToolAnchor),
          `${message.id}-text-before-other-${partIndex}`
        )
        cursor = firstToolAnchor
      }
    }

    rendered.push(
      <MessagePartRenderer
        key={`${message.id}-part-${partIndex}`}
        part={part as MessagePart}
        messageId={message.id}
        index={partIndex}
        collapseReasoning={collapseReasoning}
      />
    )
    syntheticIndex = Math.max(syntheticIndex, partIndex + 1)
  })

  // Remaining text after the last tool invocation
  if (textContent && cursor < textContent.length) {
    pushTextSlice(textContent.slice(cursor), `${message.id}-text-tail-${rendered.length}`)
  }

  return rendered
}
