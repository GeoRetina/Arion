'use client'

import { useChat } from '@ai-sdk/react'
import { type UIMessage } from 'ai'
import { v4 as uuidv4 } from 'uuid'
import { useRef, useEffect, useMemo, useState } from 'react'
import { Subtask } from '../../../../../shared/ipc-types'

import { ScrollArea } from '@/components/ui/scroll-area'
import ChatInputBox from './input/chat-input-box'
import { useChatHistoryStore } from '../../../stores/chat-history-store'
import { useChatSession } from '../hooks/useChatSession'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { MapSidebar } from '@/features/map/components/map-sidebar'
import { useAgentOrchestrationStore } from '@/stores/agent-orchestration-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { McpPermissionDialog } from '@/components/mcp-permission-dialog'
import { LayersDatabaseModal } from './layers-database-modal'

// Imported extracted components and hooks
import { createStreamingFetch } from '../utils/streaming-fetch'
import { MessageBubble } from './message/message-bubble'
import { EmptyState } from './empty-state'
import { LoadingIndicator } from './loading-indicator'
import { useMcpPermissionHandler } from '../hooks/use-mcp-permission-handler'
import { useProviderConfiguration } from '../hooks/use-provider-configuration'
import { useErrorDialog, useDatabaseModal } from '../hooks/use-dialog-state'
import { useMapSidebar } from '../hooks/use-map-sidebar'

// Helper to read text from UIMessage parts
function getTextFromParts(message: UIMessage<any, any, any>): string {
  const parts = (message as any).parts as Array<any> | undefined
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
}

// Extend UIMessage with orchestration metadata for persistence
type ExtendedMessage = UIMessage<any, any, any> & {
  orchestration?: {
    subtasks?: Subtask[]
    agentsInvolved?: string[]
    completionTime?: number
  }
}

export default function ChatInterface(): React.JSX.Element {
  // Use extracted custom hooks
  const { isMapSidebarExpanded, toggleMapSidebar } = useMapSidebar()
  const { pendingPermission, resolvePendingPermission, getServerPath } = useMcpPermissionHandler()
  const { isDatabaseModalOpen, setIsDatabaseModalOpen, handleOpenDatabase } = useDatabaseModal()

  const {
    stableChatIdForUseChat,
    currentChatIdFromStore,
    currentMessagesFromStore
    // isLoadingMessagesFromStore
  } = useChatSession()

  const { createChatAndSelect, addMessageToCurrentChat } = useChatHistoryStore()

  const { availableProvidersForInput, activeProvider, setActiveProvider, isConfigured } =
    useProviderConfiguration(stableChatIdForUseChat || null)

  // Create the streaming fetch function (memoize it)
  const streamingFetch = useMemo(() => createStreamingFetch(), [])

  // Local input state (v5 removed managed input)
  const [input, setInput] = useState('')
  const [isStreamingUi, setIsStreamingUi] = useState(false)

  const chat = useChat({
    id: stableChatIdForUseChat,
    api: '/api/chat',
    fetch: streamingFetch as unknown as typeof fetch,
    onError: () => {
      setIsStreamingUi(false)
    },
    onFinish: async (args: any) => {
      const assistantMessage = (args?.message || args) as ExtendedMessage
      setIsStreamingUi(false)
      // Basic saving logic for the final state of the assistant message
      let currentChatId = useChatHistoryStore.getState().currentChatId
      if (!currentChatId && stableChatIdForUseChat) {
        const newChatId = await createChatAndSelect({ id: stableChatIdForUseChat })
        if (newChatId) currentChatId = newChatId
      }

      // Get orchestration data from the store
      const orchestrationStore = useAgentOrchestrationStore.getState()
      const { activeSessionId, subtasks, agentsInvolved } = orchestrationStore

      // Attach orchestration data if available
      if (activeSessionId && (subtasks.length > 0 || agentsInvolved.length > 0)) {
        assistantMessage.orchestration = {
          subtasks: subtasks,
          agentsInvolved: agentsInvolved.map((agent) => agent.id),
          completionTime: Date.now() // Placeholder for completion time
        }

        // Reset orchestration after attaching to message
        orchestrationStore.resetOrchestration()
      }

      if (currentChatId) {
        const existingMsg = currentMessagesFromStore.find(
          (m) => m.id === (assistantMessage as any).id
        )
        const text = getTextFromParts(assistantMessage)
        if (!existingMsg && text && text.trim().length > 0) {
          await addMessageToCurrentChat({
            id: (assistantMessage as any).id,
            chat_id: currentChatId,
            role: assistantMessage.role as any,
            content: text,
            // Include orchestration metadata in persisted message
            orchestration: assistantMessage.orchestration
              ? JSON.stringify(assistantMessage.orchestration)
              : undefined
          })
        }
      }
    }
  })

  // Notify reasoning container to collapse when assistant starts streaming text
  useEffect(() => {
    if (isStreamingUi) {
      const last = (chat.messages as any[])[(chat.messages as any[]).length - 1]
      if (last && last.role === 'assistant') {
        window.dispatchEvent(new Event('ai-assistant-text-start'))
      }
    }
  }, [isStreamingUi, chat.messages])

  const sdkMessages = chat.messages as UIMessage[]
  const stop = chat.stop as (() => void) | undefined
  const sdkError = chat.error as Error | undefined

  // Set up auto-scrolling for new user messages
  const { latestUserMessageRef, isLatestUserMessage } = useAutoScroll({ messages: sdkMessages })

  // Effect to save user messages when sdkMessages changes and a new user message appears
  useEffect(() => {
    const latestSdkMessage =
      sdkMessages.length > 0 ? (sdkMessages[sdkMessages.length - 1] as any) : null
    if (latestSdkMessage && latestSdkMessage.role === 'user') {
      const isAlreadySaved = currentMessagesFromStore.some(
        (storeMsg) => storeMsg.id === latestSdkMessage.id
      )
      if (!isAlreadySaved) {
        const currentChatId = useChatHistoryStore.getState().currentChatId // Get latest from store
        const handleUserMessageSave = async () => {
          // ONLY save if a chat session is already established in the DB
          if (currentChatId) {
            if (['system', 'user', 'assistant', 'tool'].includes(latestSdkMessage.role)) {
              const text = getTextFromParts(latestSdkMessage)
              await addMessageToCurrentChat({
                id: latestSdkMessage.id,
                chat_id: currentChatId,
                role: latestSdkMessage.role,
                content: text
              })
            }
          }
        }
        handleUserMessageSave()
      }
    }
  }, [
    sdkMessages, // This is the primary trigger
    currentMessagesFromStore, // To check if already saved (for the current chat in store)
    stableChatIdForUseChat, // For logging
    addMessageToCurrentChat
  ])

  // Use error dialog hook
  const { isErrorDialogOpen, setIsErrorDialogOpen, errorMessage } = useErrorDialog(
    sdkError || null,
    stableChatIdForUseChat || null
  )

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isStreamingUi && stableChatIdForUseChat) {
      // Focus logic can remain
    }
  }, [isStreamingUi, sdkMessages.length, stableChatIdForUseChat])

  const displayMessages = useMemo(() => sdkMessages, [sdkMessages])

  const displayIsLoading = isStreamingUi

  // Custom handleSubmit to send message via v5 API
  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault() // Prevent default form submission if event is passed

    const isActiveProviderConfigured = activeProvider && isConfigured(activeProvider)

    if (!isActiveProviderConfigured) {
      // Determine if any provider offered in the input is configured at all
      const anyProviderConfigured = availableProvidersForInput.some((provider) =>
        isConfigured(provider.id)
      )

      if (!activeProvider && anyProviderConfigured) {
        window.alert(
          'Please select an active AI model from the bottom-left of the chat input, or configure one in the Models page.'
        )
      } else {
        window.alert(
          "No AI model is currently configured or active. Please configure an AI model from the 'Models' page to start chatting."
        )
      }
      return // Stop submission
    }

    // If an active provider is configured, send the message using v5 sendMessage
    if (input && input.trim()) {
      setIsStreamingUi(true)
      const fnSend = (chat as any)?.sendMessage
      const fnAppend = (chat as any)?.append
      if (typeof fnSend === 'function') {
        fnSend({ text: input })
      } else if (typeof fnAppend === 'function') {
        fnAppend({ id: uuidv4(), role: 'user', content: input })
      }
      setInput('')
    }
  }

  // Hydrate SDK messages from DB history on first load for the active chat
  useEffect(() => {
    const shouldHydrate =
      stableChatIdForUseChat &&
      stableChatIdForUseChat === currentChatIdFromStore &&
      (sdkMessages?.length || 0) === 0 &&
      (currentMessagesFromStore?.length || 0) > 0

    if (!shouldHydrate) return

    const append = (chat as any)?.append
    if (typeof append !== 'function') return

    // Map DB messages to UIMessage shape (parts-based)
    const normalizeRole = (role: string): any => {
      if (role === 'data' || role === 'function') return 'assistant'
      return role
    }

    for (const m of currentMessagesFromStore) {
      append({
        id: m.id,
        role: normalizeRole(m.role),
        parts: m.content ? [{ type: 'text', text: m.content }] : []
      })
    }
  }, [stableChatIdForUseChat, currentChatIdFromStore, sdkMessages, currentMessagesFromStore, chat])

  return (
    <div className="flex flex-row h-full max-h-full bg-transparent overflow-hidden relative">
      {/* Chat Interface Area - Always full width, with padding when map is visible */}
      <div
        className="flex flex-col h-full w-full bg-card transition-all duration-300 ease-in-out"
        style={{
          paddingRight: isMapSidebarExpanded ? 'max(45%, 500px)' : '0'
        }}
      >
        {/* Messages area */}
        <div className="flex-grow min-h-0">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="mx-auto w-full max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl px-4 pt-15 pb-6">
              {displayMessages.length === 0 && !displayIsLoading && <EmptyState />}

              {(displayMessages as any[]).map((m: any, index: number) => {
                // Only show streaming state for the latest assistant message
                const isLatestAssistantMessage =
                  m.role === 'assistant' && index === displayMessages.length - 1 && displayIsLoading

                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    index={index}
                    isLatestUserMessage={isLatestUserMessage(m, index)}
                    isStreaming={isLatestAssistantMessage}
                    ref={isLatestUserMessage(m, index) ? latestUserMessageRef : undefined}
                  />
                )
              })}

              {displayIsLoading &&
                (displayMessages as any[]).length > 0 &&
                (displayMessages as any[])[(displayMessages as any[]).length - 1].role ===
                  'user' && <LoadingIndicator />}

              {/* Add a spacer div with screen height to ensure enough scroll space */}
              <div className="h-screen" />

              <div ref={messagesEndRef} className="h-1" />
            </div>
          </ScrollArea>
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 backdrop-blur-sm sticky bottom-0 flex justify-center">
          <ChatInputBox
            inputValue={input}
            onValueChange={setInput}
            handleSubmit={handleSubmit}
            isStreaming={isStreamingUi}
            onStopStreaming={stop}
            chatId={stableChatIdForUseChat}
            availableProviders={availableProvidersForInput}
            activeProvider={activeProvider}
            onSelectProvider={setActiveProvider}
            isMapSidebarExpanded={isMapSidebarExpanded}
            onToggleMapSidebar={toggleMapSidebar}
            onOpenDatabase={handleOpenDatabase}
          />
        </div>
      </div>

      {/* Map Sidebar - Fixed width, positioned absolutely, and transformed */}
      <div
        className="h-full absolute top-0 right-0 transition-transform duration-300 ease-in-out"
        style={{
          width: 'max(45%, 500px)',
          transform: isMapSidebarExpanded ? 'translateX(0)' : 'translateX(100%)',
          willChange: 'transform'
        }}
      >
        <MapSidebar
          isMapSidebarExpanded={isMapSidebarExpanded}
          onToggleMapSidebar={toggleMapSidebar}
        />
      </div>

      {/* Error Dialog */}
      <Dialog open={isErrorDialogOpen} onOpenChange={setIsErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-destructive" />
              Model Configuration Error
            </DialogTitle>
            <DialogDescription asChild className="py-2">
              <ScrollArea className="max-h-[200px] rounded-md border p-4 bg-muted">
                <div className="whitespace-pre-line break-all text-foreground">{errorMessage}</div>
              </ScrollArea>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsErrorDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MCP Permission Dialog */}
      {pendingPermission && (
        <McpPermissionDialog
          isOpen={true}
          toolName={pendingPermission.toolName}
          serverPath={getServerPath(pendingPermission.serverId)}
          onPermissionResponse={resolvePendingPermission}
        />
      )}

      {/* Layers Database Modal */}
      <LayersDatabaseModal isOpen={isDatabaseModalOpen} onOpenChange={setIsDatabaseModalOpen} />
    </div>
  )
}
