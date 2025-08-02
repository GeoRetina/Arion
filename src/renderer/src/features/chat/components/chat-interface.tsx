'use client'

import { useChat, type Message as SDKMessage } from '@ai-sdk/react'
import { OrchestrationSubtask } from '../../../../../shared/ipc-types'

// Extend the SDKMessage type to include orchestration data
interface ExtendedSDKMessage extends SDKMessage {
  orchestration?: {
    subtasks?: OrchestrationSubtask[]
    agentsInvolved?: string[]
    completionTime?: number
  }
}
import { useRef, useEffect, useMemo, useState } from 'react'

import arionLogo from '@/assets/icon.png' // Added import for the logo
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import ChatInputBox from './input/chat-input-box'
import { MemoizedMarkdown, CopyMessageButton } from '@/components/markdown-renderer'
import { useLLMStore } from '@/stores/llm-store'
import { useChatHistoryStore } from '../../../stores/chat-history-store'
import { useChatSession } from '../hooks/useChatSession'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { MapSidebar } from '@/features/map/components/map-sidebar'
import ToolCallDisplay from './tool-call-display'
import ChartDisplay from '../../visualization/components/chart-display'
import OrchestrationTaskList from './orchestration-task-list'
import { AgentGroupIndicator } from './agent-indicator'
import { useAgentOrchestrationStore } from '@/stores/agent-orchestration-store'
import type { ChartDisplayProps } from '../../visualization/components/chart-display'
import {
  SUPPORTED_LLM_PROVIDERS,
  getFormattedProviderName,
  FormattableProviderConfig
} from '@/constants/llm-providers'
import type { SetMapSidebarVisibilityPayload, McpServerConfig } from '../../../../../shared/ipc-types'
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
import { useMcpPermissionStore } from '@/stores/mcp-permission-store'
import { LayersDatabaseModal } from './layers-database-modal'

// Extend the SDKMessage type to include orchestration data
interface ExtendedSDKMessage extends SDKMessage {
  orchestration?: {
    subtasks?: OrchestrationSubtask[]
    agentsInvolved?: string[]
    completionTime?: number
  }
}

// Create a better streamable fetch function for useChat that uses real-time streaming
const createStreamingFetch = () => {
  return async (url: string, options: { body?: any }) => {
    if (url.endsWith('/api/chat')) {
      if (!window.ctg?.chat?.startMessageStream || !window.ctg?.chat?.subscribeToStream) {
        return new Response(JSON.stringify({ error: 'Streaming chat API not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      try {
        const body = options.body ? JSON.parse(options.body) : undefined

        // Create a stream ID that will be used for this request
        const streamId = await window.ctg.chat.startMessageStream(body)

        // Create a ReadableStream that will receive chunks from the IPC channel
        const stream = new ReadableStream({
          start(controller) {
            // Subscribe to stream events
            const unsubscribe = window.ctg.chat.subscribeToStream(streamId, {
              onChunk: (chunk: Uint8Array) => {
                try {
                  controller.enqueue(chunk)
                } catch (e) {}
              },
              onStart: () => {},
              onError: (error: Error) => {
                // Propagate the error to the stream controller
                controller.error(error)
              },

              onEnd: () => {
                controller.close()
                unsubscribe()
              }
            })
          },
          cancel() {
            // TODO: Inform the backend to potentially cancel the stream if possible?
          }
        })

        // Return the Response with the ReadableStream
        // REMOVED: Explicit Content-Type header. Let the SDK infer/handle it based on the backend response.
        return new Response(stream, {
          // headers: { 'Content-Type': 'application/vnd.vercel.ai.stream-data+json' } // Removed
        })
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // For non-chat endpoints, use regular fetch
    return fetch(url, {
      ...options,
      body: options.body ? options.body : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export default function ChatInterface(): React.JSX.Element {
  const [isMapSidebarExpanded, setIsMapSidebarExpanded] = useState(false)
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mcpServerConfigs, setMcpServerConfigs] = useState<McpServerConfig[]>([])
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false)
  
  // Orchestration state is accessed in onFinish handler via useAgentOrchestrationStore.getState()
  
  // MCP permission dialog state
  const { 
    pendingPermission, 
    resolvePendingPermission, 
    hasPermission, 
    // requestPermission, // Not used, removing to fix TS error
    setPendingPermission 
  } = useMcpPermissionStore()

  const toggleMapSidebar = () => {
    setIsMapSidebarExpanded(!isMapSidebarExpanded)
  }

  const handleOpenDatabase = () => {
    setIsDatabaseModalOpen(true)
  }

  // Fetch MCP server configurations on component mount
  useEffect(() => {
    const fetchMcpConfigs = async () => {
      try {
        const configs = await window.ctg.settings.getMcpServerConfigs()
        setMcpServerConfigs(configs)
      } catch (error) {
        console.error('Failed to fetch MCP server configurations:', error)
      }
    }
    
    fetchMcpConfigs()
  }, [])

  // Get server path for a given serverId
  const getServerPath = (serverId: string): string | undefined => {
    const serverConfig = mcpServerConfigs.find(config => config.id === serverId)
    if (!serverConfig) return undefined
    
    // For HTTP/SSE servers, return the URL
    if (serverConfig.url) {
      return serverConfig.url
    }
    
    // For stdio servers, return the first argument (typically the script path)
    if (serverConfig.args && serverConfig.args.length > 0) {
      return serverConfig.args[0]
    }
    
    // Fallback to command if no args (shouldn't happen in practice)
    return serverConfig.command
  }

  // Handle MCP permission dialog requests from main process
  const handleMcpPermissionRequest = async (request: any) => {
    // Check if we already have permission for this tool in this chat
    const existingPermission = hasPermission(request.chatId, request.toolName)
    if (existingPermission !== null) {
      // Send response back to main process
      if (window.ctg?.mcp?.permissionResponse) {
        window.ctg.mcp.permissionResponse(request.requestId, existingPermission)
      }
      return
    }

    // Set pending permission to trigger the dialog UI
    setPendingPermission(request)
  }

  // Register the MCP permission dialog handler
  useEffect(() => {
    if (window.ctg?.mcp?.onShowPermissionDialog) {
      const unsubscribe = window.ctg.mcp.onShowPermissionDialog(handleMcpPermissionRequest)
      return () => unsubscribe()
    }
    return undefined // Adding explicit return to fix TS error
  }, [hasPermission, setPendingPermission])

  const {
    stableChatIdForUseChat,
    sdkCompatibleInitialMessages,
    currentChatIdFromStore,
    currentMessagesFromStore,
    isLoadingMessagesFromStore
  } = useChatSession()

  const { createChatAndSelect, addMessageToCurrentChat } = useChatHistoryStore()

  // Create the streaming fetch function (memoize it)
  const streamingFetch = useMemo(() => createStreamingFetch(), [])

  const {
    messages: sdkMessages,
    input,
    setInput,
    handleSubmit: originalHandleSubmit,
    isLoading: isSdkChatLoading,
    error: sdkError,
    stop
  } = useChat({
    id: stableChatIdForUseChat,
    api: '/api/chat',
    fetch: streamingFetch as unknown as typeof fetch,
    initialMessages: sdkCompatibleInitialMessages,
    onFinish: async (assistantMessage: ExtendedSDKMessage) => {
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
          agentsInvolved: agentsInvolved.map(agent => agent.id),
          completionTime: Date.now() // Placeholder for completion time
        }
        console.log('Attached orchestration data to message:', assistantMessage.orchestration)
        
        // Reset orchestration after attaching to message
        orchestrationStore.resetOrchestration()
      }

      if (currentChatId) {
        const existingMsg = currentMessagesFromStore.find((m) => m.id === assistantMessage.id)
        if (
          !existingMsg &&
          (assistantMessage.content || assistantMessage.toolInvocations?.length)
        ) {
          await addMessageToCurrentChat({
            id: assistantMessage.id,
            chat_id: currentChatId,
            role: assistantMessage.role,
            content: assistantMessage.content ?? '',
            // Include orchestration metadata in persisted message
            orchestration: assistantMessage.orchestration
                ? JSON.stringify(assistantMessage.orchestration)
                : undefined
          })
        }
      }
    }
  })

  // Set up auto-scrolling for new user messages
  const { latestUserMessageRef, isLatestUserMessage } = useAutoScroll({
    messages: sdkMessages
  })

  // Effect to save user messages when sdkMessages changes and a new user message appears
  useEffect(() => {
    const latestSdkMessage = sdkMessages.length > 0 ? sdkMessages[sdkMessages.length - 1] : null
    if (latestSdkMessage && latestSdkMessage.role === 'user') {
      const isAlreadySaved = currentMessagesFromStore.some(
        (storeMsg) => storeMsg.id === latestSdkMessage.id
      )
      if (!isAlreadySaved) {
        const currentChatId = useChatHistoryStore.getState().currentChatId // Get latest from store
        const handleUserMessageSave = async () => {
          // ONLY save if a chat session is already established in the DB
          if (currentChatId) {
            if (
              ['system', 'user', 'assistant', 'function', 'tool', 'data'].includes(
                latestSdkMessage.role
              )
            ) {
              await addMessageToCurrentChat({
                id: latestSdkMessage.id,
                chat_id: currentChatId,
                role: latestSdkMessage.role,
                content: latestSdkMessage.content
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

  // Get LLM provider states and actions from the store
  const {
    openaiConfig,
    googleConfig,
    azureConfig,
    anthropicConfig,
    ollamaConfig,
    isConfigured,
    activeProvider,
    setActiveProvider,
    isInitialized,
    initializeStore
  } = useLLMStore()

  // Initialize LLM store if not already
  useEffect(() => {
    if (!isInitialized) {
      initializeStore()
    }
  }, [isInitialized, initializeStore, stableChatIdForUseChat])

  // Effect to handle map sidebar visibility commands from main process
  useEffect(() => {
    if (window.ctg?.ui?.onSetMapSidebarVisibility) {
      const unsubscribe = window.ctg.ui.onSetMapSidebarVisibility(
        (payload: SetMapSidebarVisibilityPayload) => {
          setIsMapSidebarExpanded(payload.visible)
        }
      )
      return () => unsubscribe()
    } else {
      return undefined
    }
  }, [setIsMapSidebarExpanded])

  // Prepare provider options for ChatInputBox dynamically
  const availableProvidersForInput = useMemo(() => {
    return SUPPORTED_LLM_PROVIDERS.map((providerId) => {
      const configured = isConfigured(providerId)
      const active = activeProvider === providerId
      let providerConfig: FormattableProviderConfig | undefined = undefined

      // Get the correct config for the provider
      switch (providerId) {
        case 'openai':
          providerConfig = openaiConfig
          break
        case 'google':
          providerConfig = googleConfig
          break
        case 'azure':
          providerConfig = azureConfig
          break
        case 'anthropic':
          providerConfig = anthropicConfig
          break
        case 'vertex':
          providerConfig = googleConfig // Vertex uses googleConfig
          break
        case 'ollama':
          providerConfig = ollamaConfig
          break
      }

      const name = getFormattedProviderName(providerId, providerConfig, configured)

      return {
        id: providerId,
        name,
        isConfigured: configured,
        isActive: active
      }
    })
  }, [
    isConfigured,
    activeProvider,
    openaiConfig,
    googleConfig,
    azureConfig,
    anthropicConfig,
    ollamaConfig
  ])

  useEffect(() => {
    if (sdkError && stableChatIdForUseChat) {
      setErrorMessage(
        `An error occurred while communicating with the AI model: ${sdkError.message}\n\nPlease check your model configuration in the 'Models' page, especially the model name, and try again.`
      )
      setIsErrorDialogOpen(true)
    }
  }, [sdkError, stableChatIdForUseChat])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isSdkChatLoading && stableChatIdForUseChat) {
      // Focus logic can remain
    }
  }, [isSdkChatLoading, sdkMessages.length, stableChatIdForUseChat])

  const displayMessages: ExtendedSDKMessage[] = useMemo(() => {
    if (stableChatIdForUseChat === currentChatIdFromStore) {
      return sdkMessages
    } else {
      return currentMessagesFromStore
        .map((storeMsg) => {
          const displayableMessageCandidate: Partial<ExtendedSDKMessage> & {
            role?: 'system' | 'user' | 'assistant' | 'data' | 'tool'
          } = {
            id: storeMsg.id,
            content: storeMsg.content,
            createdAt: storeMsg.created_at ? new Date(storeMsg.created_at) : undefined,
            parts: storeMsg.content ? [{ type: 'text', text: storeMsg.content }] : [],
            toolInvocations: []
          }
          if (['system', 'user', 'assistant', 'data', 'tool'].includes(storeMsg.role)) {
            displayableMessageCandidate.role = storeMsg.role as any
          }
          return displayableMessageCandidate as ExtendedSDKMessage
        })
        .filter((msg) => msg.role !== undefined && !!msg.id)
    }
  }, [stableChatIdForUseChat, currentChatIdFromStore, sdkMessages, currentMessagesFromStore])

  const displayIsLoading =
    stableChatIdForUseChat === currentChatIdFromStore
      ? isSdkChatLoading
      : isLoadingMessagesFromStore

  // Custom handleSubmit to wrap original handleSubmit with a check
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

    // If an active provider is configured, proceed with the original submission
    originalHandleSubmit(e) // Pass the event if it exists
  }

  // Helper to render message parts
  const renderMessagePart = (part: any, messageId: string, index: number) => {
    if (!part || typeof part.type !== 'string') {
      return null
    }

    switch (part.type) {
      case 'text':
        if (typeof part.text === 'string') {
          return (
            <MemoizedMarkdown
              key={`${messageId}-text-${index}`}
              content={part.text}
              id={`${messageId}-text-${index}`}
              isAssistant={true}
            />
          )
        } else {
          return null
        }
      case 'tool-invocation':
        const toolInvocation = part.toolInvocation
        if (
          toolInvocation &&
          typeof toolInvocation === 'object' &&
          toolInvocation.toolCallId &&
          toolInvocation.toolName
          // Args are not strictly required for result display, but good for initial call display
          // toolInvocation.args
        ) {
          const { toolCallId, toolName, args, state } = toolInvocation

          // If it's a display_chart tool and it has a result, render ChartDisplay
          if (toolName === 'display_chart' && state === 'result' && toolInvocation.result) {
            const chartResult = toolInvocation.result as any // Cast to any for now
            // Construct props for ChartDisplay based on the expected structure from LlmToolService
            const chartDisplayData: ChartDisplayProps['chartData'] = {
              chartId: chartResult.chartId,
              chartType: chartResult.chartType,
              data: chartResult.data,
              config: chartResult.config
            }
            if (
              chartDisplayData.chartId &&
              chartDisplayData.chartType &&
              chartDisplayData.data &&
              chartDisplayData.config
            ) {
              return <ChartDisplay key={toolCallId} chartData={chartDisplayData} />
            } else {
              // Fallback to ToolCallDisplay for incomplete chart results
            }
          }

          // For all other tool calls, or if display_chart result is incomplete, use ToolCallDisplay
          let status: 'loading' | 'completed' | 'error' = 'loading'
          let toolResultData: any = undefined

          if (state === 'result') {
            toolResultData = toolInvocation.result
            const isError =
              toolInvocation.isError ||
              (toolResultData && typeof toolResultData === 'object' && toolResultData.isError)
            status = isError ? 'error' : 'completed'
          } else if (state === 'error') {
            status = 'error'
            toolResultData = toolInvocation.error
          } else if (state === 'partial-call' || state === 'call') {
            status = 'loading'
          }

          return (
            <ToolCallDisplay
              key={toolCallId} // Use toolCallId which should be unique per invocation attempt
              toolName={toolName}
              args={args} // args might be undefined if only result is streamed
              status={status}
              result={toolResultData}
              className="w-full text-left"
            />
          )
        } else {
          return null
        }
      default:
        return null
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
        <div className="flex-grow min-h-0">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="mx-auto w-full max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl px-4 pt-15 pb-6">
              {displayMessages.length === 0 && !displayIsLoading && (
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] md:min-h-[calc(100vh-150px)]">
                  <img src={arionLogo} alt="Arion Assistant" className="w-20 h-20 mb-4" />
                  <p className="text-muted-foreground text-center max-w-sm mb-4">
                    Your AI-powered geospatial analysis awaits.
                  </p>
                </div>
              )}

              {displayMessages.map((m: ExtendedSDKMessage, index: number) => {
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex flex-col w-full group',
                      m.role === 'user' ? 'items-end mt-3' : 'items-start' // Assistant messages align left
                    )}
                    ref={isLatestUserMessage(m, index) ? latestUserMessageRef : null}
                  >
                    <div
                      className={cn(
                        m.role === 'user'
                          ? 'max-w-[70%] bg-[var(--user-message-background)] text-card-foreground rounded-2xl py-2 px-4'
                          : 'w-full max-w-4xl text-foreground rounded-2xl px-0 dark:bg-card' // Assistant container, ADDED dark:bg-card
                      )}
                    >
                      {m.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      ) : Array.isArray(m.parts) && m.parts.length > 0 ? (
                        m.parts.map((part, index) => renderMessagePart(part, m.id, index))
                      ) : (
                        <>
                          <MemoizedMarkdown content={m.content} id={m.id} isAssistant={true} />
                          
                          {/* Display orchestration UI when metadata is available */}
                          {m.orchestration && (
                            <div className="mt-4">
                              <AgentGroupIndicator 
                                agents={m.orchestration.agentsInvolved?.map(agentId => ({
                                  id: agentId,
                                  name: agentId,
                                  type: agentId === 'orchestrator-1' ? 'orchestrator' : 'specialized',
                                  isActive: true
                                })) || []}
                                size="sm" 
                                className="mb-2" 
                                showActiveOnly={true}
                              />
                              <OrchestrationTaskList 
                                subtasks={m.orchestration.subtasks || []}
                                className="mb-2"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {(m.content ||
                      (Array.isArray(m.parts) &&
                        m.parts.some(
                          (p) => p?.type === 'text' && typeof (p as any).text === 'string'
                        ))) && (
                      <div
                        className={cn(
                          'mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
                          m.role === 'user' ? 'mr-1' : 'ml-2' // Adjust for assistant
                        )}
                      >
                        <CopyMessageButton
                          content={
                            m.content ||
                            (m.parts?.find((p) => p?.type === 'text') as any)?.text ||
                            ''
                          }
                        />
                      </div>
                    )}
                  </div>
                )
              })}

              {displayIsLoading &&
                displayMessages.length > 0 &&
                displayMessages[displayMessages.length - 1].role === 'user' && (
                  <div className="flex w-full justify-start pb-5">
                    <div className="flex items-center space-x-2 px-4 py-3 rounded-2xl text-foreground">
                      <div className="flex space-x-1">
                        <div className="h-2 w-2 rounded-full bg-chart-1 animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="h-2 w-2 rounded-full bg-chart-1 animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="h-2 w-2 rounded-full bg-chart-1 animate-bounce"></div>
                      </div>
                    </div>
                  </div>
                )}

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
            isStreaming={isSdkChatLoading}
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
      <LayersDatabaseModal
        isOpen={isDatabaseModalOpen}
        onOpenChange={setIsDatabaseModalOpen}
      />
    </div>
  )
}
