// TODO: Resolve TypeScript errors after full refactor & once all placeholders are replaced

import { useState, useEffect, useCallback, useRef, startTransition, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
// import { type ToolInvocation } from "ai"; // From 'ai' package if needed, or @ai-sdk/core
import { electronChatFetch } from '../utils/chat-fetch'

// FIXME: Placeholder for imports - these will need to be created or paths adjusted
// For now, these are minimal mocks or do-nothing functions if their state isn't critical path for chat
// REMOVED: useROIStore and useUserGeospatialStore mocks
const useAutoScroll = (
  props
): {
  scrollContainerRef: import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/index').RefObject<null>
  messagesEndRef: import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/index').RefObject<null>
  isAutoScrollEnabled: boolean
  resetScrollBehavior: () => void
} => {
  void props
  return {
    scrollContainerRef: useRef(null),
    messagesEndRef: useRef(null),
    isAutoScrollEnabled: true,
    resetScrollBehavior: () => {}
  }
}
// End Placeholder imports

// Define message part types (from Vercel AI SDK or 'ai' package, ensure consistency)
interface MessagePart {
  type: string
  [key: string]: unknown
}

interface ToolInvocationPart extends MessagePart {
  type: 'tool-invocation'
  toolInvocation: {
    toolName: string
    toolCallId: string
    args: Record<string, unknown>
    result?: unknown
    error?: string
  }
}

const toolPartPrefix = 'tool-'

type GenericPart = { type?: unknown; text?: unknown }
type GenericMessage = { content?: unknown; parts?: unknown[] }
type PendingToolResultData = Record<string, unknown> & {
  messageId: string
  toolCallId: string
  toolName: string
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const getMessageText = (message: GenericMessage): string => {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.parts)) return ''
  return message.parts
    .map((part) => part as GenericPart)
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
}

const normalizeToolInvocationPart = (part: unknown): ToolInvocationPart | null => {
  const partRecord = asRecord(part)
  if (!partRecord || typeof partRecord.type !== 'string') {
    return null
  }

  if (partRecord.type === 'tool-invocation' && partRecord.toolInvocation) {
    return part as ToolInvocationPart
  }

  if (
    partRecord.type !== 'dynamic-tool' &&
    (!partRecord.type.startsWith(toolPartPrefix) || partRecord.type === 'tool-invocation')
  ) {
    return null
  }

  const toolName =
    partRecord.type === 'dynamic-tool'
      ? (partRecord.toolName as string | undefined)
      : partRecord.type.slice(toolPartPrefix.length)
  const toolCallId = (partRecord.toolCallId ?? partRecord.id) as string | undefined
  if (!toolName || !toolCallId || typeof toolCallId !== 'string') {
    return null
  }

  const approval = asRecord(partRecord.approval)
  const approved = approval?.approved
  const approvalReason = approval?.reason
  const errorText =
    (partRecord.errorText as string | undefined) ??
    (approved === false
      ? typeof approvalReason === 'string'
        ? approvalReason
        : 'Tool approval denied.'
      : undefined)

  const inputValue = partRecord.input ?? partRecord.rawInput
  const resultValue = partRecord.output ?? (errorText ? { error: errorText } : undefined)

  return {
    type: 'tool-invocation',
    toolInvocation: {
      toolName,
      toolCallId,
      args:
        inputValue && typeof inputValue === 'object' ? (inputValue as Record<string, unknown>) : {},
      result: resultValue,
      error: errorText
    }
  } as ToolInvocationPart
}

// Helper to get tool invocation parts from a message
const getToolInvocationParts = (message: UIMessage): ToolInvocationPart[] => {
  const parts = (message as { parts?: unknown[] }).parts
  if (!Array.isArray(parts)) return []
  return parts.map(normalizeToolInvocationPart).filter(Boolean) as ToolInvocationPart[]
}

interface ToolCallingMessageResults {
  // Keeping this structure for potential tool result display
  [key: string]: unknown // Simplified for now, specific tool results can be added back later
}

interface UseChatLogicProps {
  chatId: string
  initialMessages: UIMessage[]
  isAnalystActive: boolean // This might determine if certain system prompts or tools are available
}

export function useChatLogic({ chatId, initialMessages }: UseChatLogicProps): {
  messages: UIMessage<
    unknown,
    import('/mnt/e/Coding/open-source/Arion/node_modules/ai/dist/index').UIDataTypes,
    import('/mnt/e/Coding/open-source/Arion/node_modules/ai/dist/index').UITools
  >[]
  isLoading: boolean
  error: Error | undefined
  isChatStarted: boolean
  isWaitingForFirstResponse: boolean
  messageResults: { [messageId: string]: ToolCallingMessageResults }
  toolSequences: {
    [messageId: string]: {
      steps: Array<{ id: string; titles: Array<{ toolCallId: string; toolTitle: string }> }>
      isComplete: boolean
    }
  }
  progressSteps: {
    [messageId: string]: { id: string; titles: Array<{ toolCallId: string; toolTitle: string }> }[]
  }
  handleSendMessage: (content: string, selectedRoi?: string | null) => void
  selectedRoiForBanner: string | null
  scrollContainerRef: import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/index').RefObject<null>
  messagesEndRef: import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/index').RefObject<null>
  toolCallTitlesMap: { [key: string]: { toolCallId: string; toolTitle: string }[] }
  latestUserMessageIdRef: import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/index').RefObject<
    string | null
  >
  stop: () => void
  completedMessageIds: Set<string>
  stoppedSequenceId: string | null
  isManuallyStoppedByUser: boolean
  setStoppingRequested: (isRequested: boolean) => void
  shouldShowToolResults: (messageId: string) => boolean
  isStoppingRequestedRef: import('/mnt/e/Coding/open-source/Arion/node_modules/@types/react/index').RefObject<boolean>
} {
  // REMOVED: selectedRoiGeometryInChat and selectedUserGeospatialSource state/hooks

  const [isChatStarted, setIsChatStarted] = useState(initialMessages && initialMessages.length > 0)
  const [isWaitingForFirstResponse, setIsWaitingForFirstResponse] = useState(false)

  const [completedMessageIds, setCompletedMessageIds] = useState<Set<string>>(new Set())
  const [messageResults, setMessageResults] = useState<{
    [messageId: string]: ToolCallingMessageResults
  }>({})

  const [, setPendingToolCallIds] = useState<Set<string>>(new Set())
  const [toolResultsProcessed] = useState<Set<string>>(new Set())
  const [pendingToolResultsData, setPendingToolResultsData] = useState<PendingToolResultData[]>([])

  const [toolCallTitlesMap] = useState<{
    [key: string]: { toolCallId: string; toolTitle: string }[]
  }>({})
  const [progressSteps, setProgressSteps] = useState<{
    [messageId: string]: Array<{
      id: string
      titles: Array<{ toolCallId: string; toolTitle: string }>
    }>
  }>({})
  const [toolSequences, setToolSequences] = useState<{
    [messageId: string]: {
      steps: Array<{
        id: string
        titles: Array<{ toolCallId: string; toolTitle: string }>
      }>
      isComplete: boolean
    }
  }>({})
  const latestUserMessageIdRef = useRef<string | null>(null)

  const [selectedRoiForBanner, setSelectedRoiForBanner] = useState<string | null>(null)
  const [stoppedSequenceId, setStoppedSequenceId] = useState<string | null>(null)
  const [isManuallyStoppedByUser, setIsManuallyStoppedByUser] = useState(false)
  const isStoppingRequestedRef = useRef(false)

  const [messageContentState, setMessageContentState] = useState<{
    [messageId: string]: boolean
  }>({})
  const [messageStreamingCompleted, setMessageStreamingCompleted] = useState<{
    [messageId: string]: boolean
  }>({})
  const messageContentRef = useRef<{ [messageId: string]: string }>({})
  const lastResponseTimestampRef = useRef<number>(0)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        fetch: electronChatFetch as unknown as typeof fetch
      }),
    []
  )

  const {
    messages,
    sendMessage,
    status,
    error,
    stop: originalStop
  } = useChat({
    transport,
    experimental_throttle: 50,
    id: chatId,
    messages: initialMessages,
    onFinish: ({ message }) => {
      setCompletedMessageIds((prev) => new Set([...prev, message.id]))

      if (message.role === 'assistant' && getMessageText(message).trim()) {
        setMessageStreamingCompleted((prev) => ({ ...prev, [message.id]: true }))
        setMessageContentState((prev) => ({ ...prev, [message.id]: true }))
      }

      const toolInvocationParts = getToolInvocationParts(message)
      if (toolInvocationParts.length > 0) {
        const toolCallIds = toolInvocationParts.map((part) => part.toolInvocation.toolCallId)
        setPendingToolCallIds((prev) => {
          const newSet = new Set(prev)
          toolCallIds.forEach((id) => newSet.add(id))
          return newSet
        })
      }
      if (latestUserMessageIdRef.current && message.role === 'assistant') {
        const isTextResponseFinished = Boolean(getMessageText(message).trim())
        const allToolsProcessedForThisMessage = toolInvocationParts.every(
          (p) => p.toolInvocation.result
        )

        if (
          isTextResponseFinished ||
          (toolInvocationParts.length > 0 && allToolsProcessedForThisMessage)
        ) {
          setToolSequences((prev) => {
            const userMessageId = latestUserMessageIdRef.current!
            const seq = prev[userMessageId]
            if (seq && !seq.isComplete) {
              return {
                ...prev,
                [userMessageId]: { ...seq, isComplete: true }
              }
            }
            return prev
          })
        }
      }
    }
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (status === 'streaming') {
      lastResponseTimestampRef.current = Date.now()
      setIsWaitingForFirstResponse(false)
    }
  }, [status])

  const { scrollContainerRef, messagesEndRef, resetScrollBehavior } = useAutoScroll({
    isLoading,
    isChatStarted,
    messages,
    progressSteps
  })

  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user')
    const lastUserMessage = userMessages[userMessages.length - 1]
    if (lastUserMessage) {
      const userMessageId = lastUserMessage.id
      latestUserMessageIdRef.current = userMessageId
      if (!toolSequences[userMessageId]) {
        setToolSequences((prev) => ({ ...prev, [userMessageId]: { steps: [], isComplete: false } }))
      }
      if (!progressSteps[userMessageId]) {
        setProgressSteps((prev) => ({ ...prev, [userMessageId]: [] }))
      }
    }
  }, [messages, progressSteps, toolSequences])

  useEffect(() => {
    // REMOVED: selectedRoiGeometryInChat dependency and logic, selectedRoiForBanner is now driven by handleSendMessage directly
  }, []) // Kept empty if other logic dependent on selectedRoiForBanner is added later

  useEffect(() => {
    const newToolData: PendingToolResultData[] = []
    messages.forEach((m) => {
      if (m.role === 'assistant') {
        const toolInvocationParts = getToolInvocationParts(m)
        toolInvocationParts.forEach((part) => {
          const { toolCallId, toolName, result } = part.toolInvocation
          if (toolName && result && !toolResultsProcessed.has(toolCallId)) {
            toolResultsProcessed.add(toolCallId)
            const resultRecord =
              result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
            newToolData.push({
              ...resultRecord,
              toolCallId,
              toolName,
              messageId: m.id
            })
          }
        })
      }
    })

    if (newToolData.length > 0) {
      setPendingToolResultsData((prev) => [...prev, ...newToolData])
    }
  }, [messages, toolResultsProcessed])

  useEffect(() => {
    if (pendingToolResultsData.length === 0) return

    const updatesByMessage = new Map<string, Partial<ToolCallingMessageResults>>()
    const toolCallIdsThisBatch = new Set<string>()

    pendingToolResultsData.forEach((resultData) => {
      const { messageId, toolCallId, toolName, ...actualResult } = resultData
      const messageUpdate = updatesByMessage.get(messageId) || {}
      messageUpdate[toolName] = actualResult
      messageUpdate.toolComponent = actualResult.toolComponent || toolName
      updatesByMessage.set(messageId, messageUpdate)
      toolCallIdsThisBatch.add(toolCallId)
    })

    if (updatesByMessage.size > 0) {
      startTransition(() => {
        setMessageResults((prev) => {
          const newState = { ...prev }
          updatesByMessage.forEach((update, msgId) => {
            newState[msgId] = { ...(prev[msgId] || {}), ...update }
          })
          return newState
        })

        setPendingToolCallIds((prev) => {
          const newSet = new Set(prev)
          toolCallIdsThisBatch.forEach((id) => newSet.delete(id))
          return newSet
        })
      })
    }
    setPendingToolResultsData([])
  }, [pendingToolResultsData])

  useEffect(() => {
    if (!latestUserMessageIdRef.current) return
    const userMessageIndex = messages.findIndex((m) => m.id === latestUserMessageIdRef.current)
    if (userMessageIndex >= 0) {
      const nextAssistantMessage = messages
        .slice(userMessageIndex + 1)
        .find((m) => m.role === 'assistant')
      if (nextAssistantMessage && getMessageText(nextAssistantMessage).trim()) {
        if (!messageContentState[nextAssistantMessage.id]) {
          setMessageContentState((prev) => ({ ...prev, [nextAssistantMessage.id]: true }))
        }
        if (isStoppingRequestedRef.current) {
          originalStop()
        }
      }
    }
  }, [messages, originalStop, messageContentState])

  const stop = useCallback(() => {
    setIsManuallyStoppedByUser(true)
    const currentUserMessageId = latestUserMessageIdRef.current
    if (currentUserMessageId && toolSequences[currentUserMessageId]?.steps.length > 0) {
      setStoppedSequenceId(currentUserMessageId)
      setToolSequences((prev) => {
        if (prev[currentUserMessageId] && !prev[currentUserMessageId].isComplete) {
          return {
            ...prev,
            [currentUserMessageId]: { ...prev[currentUserMessageId], isComplete: true }
          }
        }
        return prev
      })
    }
    originalStop()
  }, [originalStop, toolSequences])

  const shouldShowToolResults = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId)
      const textStreamCompleted = messageStreamingCompleted[messageId] === true
      const hasTextContent = Boolean(msg && getMessageText(msg).trim())
      const hasToolInvocations = msg ? getToolInvocationParts(msg).length > 0 : false

      if (hasTextContent) return textStreamCompleted
      if (hasToolInvocations) return completedMessageIds.has(messageId)
      return false
    },
    [completedMessageIds, messageStreamingCompleted, messages]
  )

  useEffect(() => {
    if (!isLoading) {
      const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistantMessage && getMessageText(lastAssistantMessage).trim()) {
        if (!messageStreamingCompleted[lastAssistantMessage.id]) {
          setMessageStreamingCompleted((prev) => ({ ...prev, [lastAssistantMessage.id]: true }))
        }
      }
    }
  }, [isLoading, messages, completedMessageIds, messageStreamingCompleted])

  useEffect(() => {
    messages.forEach((message) => {
      if (message.role === 'assistant') {
        const textContent = getMessageText(message)
        if (textContent) {
          messageContentRef.current[message.id] = textContent
        }
      }
    })
  }, [messages])

  const handleSendMessage = useCallback(
    (content: string, selectedRoi?: string | null) => {
      // selectedRoi is kept for banner logic
      if (!isChatStarted) setIsChatStarted(true)
      if (selectedRoi) setSelectedRoiForBanner(selectedRoi) // Still set for UI banner if ChatInputBox uses it

      setIsWaitingForFirstResponse(true)

      if (content.trim()) {
        resetScrollBehavior()
        sendMessage({ text: content })
      } else {
        setIsWaitingForFirstResponse(false)
      }
    },
    [sendMessage, isChatStarted, resetScrollBehavior]
  )

  const setStoppingRequested = useCallback(
    (isRequested: boolean) => {
      isStoppingRequestedRef.current = isRequested
      if (
        isRequested &&
        isLoading &&
        (toolSequences[latestUserMessageIdRef.current || '']?.steps.length || 0) > 0
      ) {
        void 0
      }
    },
    [isLoading, toolSequences, latestUserMessageIdRef]
  )

  return {
    messages,
    isLoading,
    error,
    isChatStarted,
    isWaitingForFirstResponse,
    messageResults,
    toolSequences,
    progressSteps,
    handleSendMessage,
    selectedRoiForBanner, // Kept for ChatInputBox display
    scrollContainerRef,
    messagesEndRef,
    toolCallTitlesMap,
    latestUserMessageIdRef,
    stop,
    completedMessageIds,
    stoppedSequenceId,
    isManuallyStoppedByUser,
    setStoppingRequested,
    shouldShowToolResults,
    isStoppingRequestedRef
  }
}
