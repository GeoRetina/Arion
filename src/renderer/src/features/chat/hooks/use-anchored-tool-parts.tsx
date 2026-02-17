import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MessagePartRenderer } from '../components/message/message-part-renderer'

type AnchoredMessage = {
  id: string
  role: string
  content?: string
  parts?: any[]
}

interface UseAnchoredToolPartsOptions {
  message: AnchoredMessage
  collapseReasoning: boolean
  isUser: boolean
}

const toolPartPrefix = 'tool-'

const isToolPart = (part: any) =>
  part &&
  typeof part.type === 'string' &&
  (part.type === 'tool-invocation' ||
    part.type === 'dynamic-tool' ||
    part.type.startsWith(toolPartPrefix))

const getToolCallId = (part: any) =>
  part?.toolInvocation?.toolCallId ?? part?.toolCallId ?? part?.id

export function useAnchoredToolParts({
  message,
  collapseReasoning,
  isUser
}: UseAnchoredToolPartsOptions): ReactNode[] | null {
  const toolAnchorRef = useRef<Record<string, number>>({})

  const textParts = useMemo(
    () =>
      Array.isArray(message.parts)
        ? message.parts.filter((p) => p && p.type === 'text' && typeof (p as any).text === 'string')
        : [],
    [message.parts]
  )

  const textContent = useMemo(
    () =>
      textParts.length > 0
        ? textParts.map((part) => (part as any).text as string).join('')
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
    () =>
      Array.isArray(message.parts)
        ? message.parts.findIndex(
            (p) => p && p.type === 'text' && typeof (p as any).text === 'string'
          )
        : -1,
    [message.parts]
  )

  const hasAnchoredToolFlow = useMemo(
    () => Boolean(textParts.length > 0 && toolParts.length > 0 && !isUser),
    [textParts, toolParts, isUser]
  )

  const resolveAnchor = (toolCallId: string | undefined) => {
    if (toolCallId && toolAnchorRef.current[toolCallId] !== undefined) {
      return toolAnchorRef.current[toolCallId]
    }
    return textContent.length
  }

  const firstToolAnchor = useMemo(() => {
    if (!hasAnchoredToolFlow) return textContent.length
    return toolParts
      .map((part: any) => resolveAnchor(getToolCallId(part)))
      .reduce((min: number, val: number) => Math.min(min, val), textContent.length)
  }, [hasAnchoredToolFlow, textContent, toolParts])

  // Reset anchors when the message changes
  useEffect(() => {
    toolAnchorRef.current = {}
  }, [message.id])

  // Capture the text length when each tool call first appears to anchor later text below it
  useEffect(() => {
    if (!hasAnchoredToolFlow) return
    const currentLength = textContent.length
    toolParts.forEach((part: any) => {
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
        part={part}
        messageId={message.id}
        index={partIndex}
        collapseReasoning={collapseReasoning}
      />
    ))
  }

  const rendered: ReactNode[] = []
  let cursor = 0
  let syntheticIndex = 0

  const pushTextSlice = (slice: string, key: string) => {
    if (!slice || slice.length === 0) return
    rendered.push(
      <MessagePartRenderer
        key={key}
        part={{ type: 'text', text: slice } as any}
        messageId={message.id}
        index={syntheticIndex++}
        collapseReasoning={collapseReasoning}
      />
    )
  }

  parts.forEach((part, partIndex) => {
    if (!part || typeof part !== 'object') return
    if (part.type === 'text') {
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
          part={part}
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
        part={part}
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
