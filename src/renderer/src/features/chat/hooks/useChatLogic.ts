// @ts-nocheck
// TODO: Resolve TypeScript errors after full refactor & once all placeholders are replaced

import { useState, useEffect, useCallback, useRef, startTransition } from 'react'
import { useChat, type Message, type ToolInvocation } from '@ai-sdk/react'
// import { type ToolInvocation } from "ai"; // From 'ai' package if needed, or @ai-sdk/core
import { MAX } from 'uuid' // Assuming 'uuid' will be a dependency
import { v4 as uuidv4 } from 'uuid' // Using uuid for proper ID generation
import { MAX_LLM_STEPS } from '../constants/llm.constants'
import { electronChatFetch } from '../utils/chat-fetch'

// FIXME: Placeholder for imports - these will need to be created or paths adjusted
// For now, these are minimal mocks or do-nothing functions if their state isn't critical path for chat
// REMOVED: useROIStore and useUserGeospatialStore mocks
const generateUUID = () => `id-${Math.random().toString(36).substr(2, 9)}` // Basic UUID for now
const useAutoScroll = (props) => ({
  scrollContainerRef: useRef(null),
  messagesEndRef: useRef(null),
  isAutoScrollEnabled: true,
  resetScrollBehavior: () => {}
})
// End Placeholder imports

// Types from the original component
interface MessageCompletionState {
  isComplete: boolean
  // hasAnalysis: boolean; // Simplified: not tracking specific analysis types for now
}

// Define message part types (from Vercel AI SDK or 'ai' package, ensure consistency)
interface MessagePart {
  type: string
  [key: string]: any
}

interface TextPart extends MessagePart {
  type: 'text'
  text: string
}

interface ToolInvocationPart extends MessagePart {
  type: 'tool-invocation'
  toolInvocation: {
    toolName: string
    toolCallId: string
    args: any
    result?: any
  }
}

// Helper to get tool invocation parts from a message
const getToolInvocationParts = (message: Message): ToolInvocationPart[] => {
  const parts = (message as any).parts
  if (!Array.isArray(parts)) return []
  return parts.filter((part): part is ToolInvocationPart => part.type === 'tool-invocation')
}

interface ToolCallingMessageResults {
  // Keeping this structure for potential tool result display
  [key: string]: any // Simplified for now, specific tool results can be added back later
}

interface UseChatLogicProps {
  chatId: string
  initialMessages: Message[]
  isAnalystActive: boolean // This might determine if certain system prompts or tools are available
}

export function useChatLogic({ chatId, initialMessages }: UseChatLogicProps) {
  // REMOVED: selectedRoiGeometryInChat and selectedUserGeospatialSource state/hooks

  const [isChatStarted, setIsChatStarted] = useState(initialMessages && initialMessages.length > 0)
  const [isWaitingForFirstResponse, setIsWaitingForFirstResponse] = useState(false)

  const [completedMessageIds, setCompletedMessageIds] = useState<Set<string>>(new Set())
  const [messageResults, setMessageResults] = useState<{
    [messageId: string]: ToolCallingMessageResults
  }>({})

  const [pendingToolCallIds, setPendingToolCallIds] = useState<Set<string>>(new Set())
  const [toolResultsProcessed, setToolResultsProcessed] = useState<Set<string>>(new Set())
  const [pendingToolResultsData, setPendingToolResultsData] = useState<any[]>([])

  const [toolCallTitlesMap, setToolCallTitlesMap] = useState<{
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

  const {
    messages,
    append,
    isLoading,
    error,
    stop: originalStop,
    setMessages
  } = useChat({
    fetch: electronChatFetch as unknown as typeof fetch,
    experimental_throttle: 50,
    maxSteps: MAX_LLM_STEPS,
    id: chatId,
    initialMessages,
    body: {},
    onResponse: (response) => {
      lastResponseTimestampRef.current = Date.now()
      setIsWaitingForFirstResponse(false)
    },
    onFinish: (message) => {
      setCompletedMessageIds((prev) => new Set([...prev, message.id]))

      if (message.role === 'assistant' && message.content?.trim()) {
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
        const isTextResponseFinished = !!message.content?.trim()
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
  }, [messages])

  useEffect(() => {
    // REMOVED: selectedRoiGeometryInChat dependency and logic, selectedRoiForBanner is now driven by handleSendMessage directly
  }, []) // Kept empty if other logic dependent on selectedRoiForBanner is added later

  useEffect(() => {
    const newToolData: any[] = []
    messages.forEach((m) => {
      if (m.role === 'assistant') {
        const toolInvocationParts = getToolInvocationParts(m)
        toolInvocationParts.forEach((part) => {
          const { toolCallId, toolName, result } = part.toolInvocation
          if (toolName && result && !toolResultsProcessed.has(toolCallId)) {
            toolResultsProcessed.add(toolCallId)
            newToolData.push({
              ...result,
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
      if (nextAssistantMessage && nextAssistantMessage.content?.trim()) {
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
      const hasTextContent = !!msg?.content?.trim()
      const hasToolInvocations = (msg?.toolInvocations?.length || 0) > 0

      if (hasTextContent) return textStreamCompleted
      if (hasToolInvocations) return completedMessageIds.has(messageId)
      return false
    },
    [completedMessageIds, messageStreamingCompleted, messages]
  )

  useEffect(() => {
    if (!isLoading) {
      const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistantMessage && lastAssistantMessage.content?.trim()) {
        if (!messageStreamingCompleted[lastAssistantMessage.id]) {
          setMessageStreamingCompleted((prev) => ({ ...prev, [lastAssistantMessage.id]: true }))
        }
      }
    }
  }, [isLoading, messages, completedMessageIds, messageStreamingCompleted])

  useEffect(() => {
    messages.forEach((message) => {
      if (message.role === 'assistant' && message.content) {
        messageContentRef.current[message.id] = message.content
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
        append({ role: 'user', content: content, id: uuidv4() } as Message)
      } else {
        setIsWaitingForFirstResponse(false)
      }
    },
    [append, isChatStarted, resetScrollBehavior]
  )

  const setStoppingRequested = useCallback(
    (isRequested: boolean) => {
      isStoppingRequestedRef.current = isRequested
      if (
        isRequested &&
        isLoading &&
        (toolSequences[latestUserMessageIdRef.current || '']?.steps.length || 0) > 0
      ) {
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
