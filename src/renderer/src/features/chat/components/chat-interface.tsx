'use client'

import { v4 as uuidv4 } from 'uuid'
import { useRef, useEffect, useMemo, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import ChatInputBox from './input/chat-input-box'
import { useChatSession } from '../hooks/useChatSession'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { MapSidebar } from '@/features/map/components/map-sidebar'
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
import { toast } from 'sonner'

// Imported extracted components and hooks
import { MessageBubble } from './message/message-bubble'
import { EmptyState } from './empty-state'
import { LoadingIndicator } from './loading-indicator'
import { useMcpPermissionHandler } from '../hooks/use-mcp-permission-handler'
import { useProviderConfiguration } from '../hooks/use-provider-configuration'
import { useErrorDialog, useDatabaseModal } from '../hooks/use-dialog-state'
import { useMapSidebar } from '../hooks/use-map-sidebar'
import { useScrollReset } from '../hooks/use-scroll-reset'
import { useReasoningNotification } from '../hooks/use-reasoning-notification'
import { useChatController } from '../hooks/use-chat-controller'
import { hasRenderableAssistantContent } from '../utils/message-part-utils'

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

  const { availableProvidersForInput, activeProvider, setActiveProvider, isConfigured } =
    useProviderConfiguration(stableChatIdForUseChat || null)

  // Local input state (v5 removed managed input)
  const [input, setInput] = useState('')
  const [isStreamingUi, setIsStreamingUi] = useState(false)
  const { chat, sdkMessages, sdkError, stop } = useChatController({
    stableChatIdForUseChat,
    currentMessagesFromStore,
    currentChatIdFromStore,
    setIsStreamingUi
  })

  // Set up auto-scrolling for new user messages
  const { latestUserMessageRef, isLatestUserMessage } = useAutoScroll({ messages: sdkMessages })

  // Notify reasoning container to collapse when assistant starts streaming text
  useReasoningNotification({
    isStreamingUi,
    chatMessages: chat.messages as any[]
  })

  // Use error dialog hook
  const { isErrorDialogOpen, setIsErrorDialogOpen, errorMessage } = useErrorDialog(
    sdkError || null,
    stableChatIdForUseChat || null
  )

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  // Reset scroll position when chat changes
  useScrollReset({
    scrollAreaRef,
    chatId: stableChatIdForUseChat ?? null
  })

  useEffect(() => {
    if (!isStreamingUi && stableChatIdForUseChat) {
      // Focus logic can remain
    }
  }, [isStreamingUi, sdkMessages.length, stableChatIdForUseChat])

  const displayMessages = useMemo(() => sdkMessages, [sdkMessages])

  const displayIsLoading = isStreamingUi
  const lastDisplayMessage =
    displayMessages.length > 0 ? (displayMessages as any[])[displayMessages.length - 1] : null
  const shouldShowLoadingIndicator =
    displayIsLoading &&
    (lastDisplayMessage?.role === 'user' ||
      (lastDisplayMessage?.role === 'assistant' &&
        !hasRenderableAssistantContent(lastDisplayMessage)))

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
        toast.error('No AI model selected', {
          description:
            'Please select an active AI model from the bottom-left of the chat input, or configure one in the Models page.'
        })
      } else {
        toast.error('No AI model configured', {
          description: "Please configure an AI model from the 'Models' page to start chatting."
        })
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
        <div className="grow min-h-0">
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

              {shouldShowLoadingIndicator && <LoadingIndicator />}

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
              <ScrollArea className="max-h-50 rounded-md border p-4 bg-muted">
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
