'use client'

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
import { AlertTriangle, Files } from 'lucide-react'
import { McpPermissionDialog } from '@/components/mcp-permission-dialog'
import { LayersDatabaseModal } from './layers-database-modal'
import { toast } from 'sonner'
import ExternalRuntimeApprovalDialog from './external-runtime-approval-dialog'
import { ActiveExternalRuntimeRunPanel } from './external-runtime-run-card'
import { useExternalRuntimeStore } from '@/stores/external-runtime-store'

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
import { useChatFileDrop } from '../hooks/use-chat-file-drop'
import { hasRenderableAssistantContent } from '../utils/message-part-utils'
import { cn } from '@/lib/utils'
import { SUPPORTED_LAYER_IMPORT_DESCRIPTION } from '@/services/layer-import'
import {
  resolveReasoningBudgetPreset,
  resolveReasoningEffort,
  type ReasoningBudgetPreset,
  type ReasoningEffort
} from '../../../../../shared/utils/model-capabilities'
import { useLayerFileImport } from './input/use-layer-file-import'
import { ChatInputBanner } from '@/components/ui/chat-input-banner'
import { Loader2 } from 'lucide-react'
import type { ChatInputBannerItem } from './input/chat-input-box'

export default function ChatInterface(): React.JSX.Element {
  // Use extracted custom hooks
  const { isMapSidebarExpanded, toggleMapSidebar } = useMapSidebar()
  const { pendingPermission, resolvePendingPermission, getServerPath } = useMcpPermissionHandler()
  const { isDatabaseModalOpen, setIsDatabaseModalOpen, handleOpenDatabase } = useDatabaseModal()
  const initializeExternalRuntimes = useExternalRuntimeStore((state) => state.initialize)
  const loadExternalRuntimeRuns = useExternalRuntimeStore((state) => state.loadRuns)
  const approveExternalRuntimeRequest = useExternalRuntimeStore((state) => state.approveRequest)
  const denyExternalRuntimeRequest = useExternalRuntimeStore((state) => state.denyRequest)
  const isResolvingExternalRuntimeApproval = useExternalRuntimeStore(
    (state) => state.isResolvingApproval
  )

  const {
    stableChatIdForUseChat,
    currentChatIdFromStore,
    currentMessagesFromStore
    // isLoadingMessagesFromStore
  } = useChatSession()

  const { availableProvidersForInput, activeProvider, setActiveProvider, isConfigured } =
    useProviderConfiguration(stableChatIdForUseChat || null)
  const [reasoningEffortByModel, setReasoningEffortByModel] = useState<
    Record<string, ReasoningEffort>
  >({})
  const [reasoningBudgetPresetByModel, setReasoningBudgetPresetByModel] = useState<
    Record<string, ReasoningBudgetPreset>
  >({})

  const pendingExternalRuntimeApproval = useExternalRuntimeStore((state) => {
    if (stableChatIdForUseChat) {
      const scopedRequest = state.approvalRequests.find(
        (request) => request.chatId === stableChatIdForUseChat
      )
      if (scopedRequest) {
        return scopedRequest
      }
    }

    return state.approvalRequests[0] || null
  })

  // Local input state (v5 removed managed input)
  const [input, setInput] = useState('')
  const [isStreamingUi, setIsStreamingUi] = useState(false)
  const { chat, sdkMessages, sdkError, stop } = useChatController({
    stableChatIdForUseChat,
    currentMessagesFromStore,
    currentChatIdFromStore,
    setIsStreamingUi
  })
  const layerFileImport = useLayerFileImport({
    disabled: isStreamingUi,
    source: 'file-import'
  })

  // Set up auto-scrolling for new user messages
  const { latestUserMessageRef, isLatestUserMessage } = useAutoScroll({ messages: sdkMessages })

  // Notify reasoning container to collapse when assistant starts streaming text
  useReasoningNotification({
    isStreamingUi,
    chatMessages: chat.messages
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

  useEffect(() => {
    void initializeExternalRuntimes()
  }, [initializeExternalRuntimes])

  useEffect(() => {
    if (!stableChatIdForUseChat) {
      return
    }

    void loadExternalRuntimeRuns(stableChatIdForUseChat)
  }, [stableChatIdForUseChat, loadExternalRuntimeRuns])

  const displayMessages = useMemo(() => sdkMessages, [sdkMessages])
  const activeProviderOption = useMemo(
    () =>
      activeProvider
        ? availableProvidersForInput.find((provider) => provider.id === activeProvider) || null
        : null,
    [activeProvider, availableProvidersForInput]
  )
  const activeReasoningPreferenceKey = useMemo(() => {
    if (!activeProviderOption?.modelId) {
      return null
    }

    return `${activeProviderOption.id}:${activeProviderOption.modelId}`
  }, [activeProviderOption])
  const availableReasoningEfforts = useMemo(() => {
    if (!activeProviderOption?.reasoningCapabilities.supportsReasoningEffort) {
      return []
    }

    return activeProviderOption.reasoningCapabilities.reasoningEffortValues ?? []
  }, [activeProviderOption])
  const availableReasoningBudgetPresets = useMemo(() => {
    if (!activeProviderOption?.reasoningCapabilities.supportsReasoningBudgetPresets) {
      return []
    }

    return activeProviderOption.reasoningCapabilities.reasoningBudgetPresetValues ?? []
  }, [activeProviderOption])
  const selectedReasoningEffort = useMemo(() => {
    if (
      !activeProviderOption?.reasoningCapabilities.supportsReasoningEffort ||
      !activeReasoningPreferenceKey ||
      availableReasoningEfforts.length === 0
    ) {
      return null
    }

    const preferredEffort = reasoningEffortByModel[activeReasoningPreferenceKey]
    return (
      resolveReasoningEffort(activeProviderOption.reasoningCapabilities, preferredEffort) ?? null
    )
  }, [
    activeProviderOption,
    activeReasoningPreferenceKey,
    availableReasoningEfforts,
    reasoningEffortByModel
  ])
  const selectedReasoningBudgetPreset = useMemo(() => {
    if (
      !activeProviderOption?.reasoningCapabilities.supportsReasoningBudgetPresets ||
      !activeReasoningPreferenceKey ||
      availableReasoningBudgetPresets.length === 0
    ) {
      return null
    }

    const preferredPreset = reasoningBudgetPresetByModel[activeReasoningPreferenceKey]

    return (
      resolveReasoningBudgetPreset(activeProviderOption.reasoningCapabilities, preferredPreset) ??
      null
    )
  }, [
    activeProviderOption,
    activeReasoningPreferenceKey,
    availableReasoningBudgetPresets,
    reasoningBudgetPresetByModel
  ])

  const displayIsLoading = isStreamingUi
  const lastDisplayMessage = displayMessages.at(-1) ?? null
  const shouldShowLoadingIndicator =
    displayIsLoading &&
    (lastDisplayMessage?.role === 'user' ||
      (lastDisplayMessage?.role === 'assistant' &&
        !hasRenderableAssistantContent(lastDisplayMessage)))
  const {
    isFileDragActive,
    handleFileDragEnter,
    handleFileDragOver,
    handleFileDragLeave,
    handleFileDrop
  } = useChatFileDrop({
    disabled: isStreamingUi,
    isImporting: layerFileImport.uploadState === 'uploading',
    onFileDrop: layerFileImport.importFile
  })

  // Build banners for chat input
  const chatInputBanners = useMemo<ChatInputBannerItem[]>(() => {
    const items: ChatInputBannerItem[] = []

    if (layerFileImport.importProgress) {
      const { title, message, progress } = layerFileImport.importProgress
      items.push({
        id: 'layer-import-progress',
        content: (
          <ChatInputBanner
            icon={<Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            progress={progress}
          >
            <span className="text-xs font-normal">{title}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {progress}% &middot; {message}
            </span>
          </ChatInputBanner>
        )
      })
    }

    return items
  }, [layerFileImport.importProgress])

  // Custom handleSubmit to send message via v5 API
  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>): void => {
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
      void chat.sendMessage(
        { text: input },
        selectedReasoningEffort || selectedReasoningBudgetPreset
          ? {
              body: {
                reasoningConfig: {
                  ...(selectedReasoningEffort ? { effort: selectedReasoningEffort } : {}),
                  ...(selectedReasoningBudgetPreset
                    ? { budgetPreset: selectedReasoningBudgetPreset }
                    : {})
                }
              }
            }
          : undefined
      )
      setInput('')
    }
  }

  return (
    <div className="flex flex-row h-full max-h-full bg-transparent overflow-hidden relative">
      {/* Chat Interface Area - Always full width, with padding when map is visible */}
      <div
        className={cn(
          'relative flex flex-col h-full w-full bg-card transition-all duration-300 ease-in-out',
          isFileDragActive && 'bg-primary/5'
        )}
        style={{
          paddingRight: isMapSidebarExpanded ? 'max(45%, 500px)' : '0'
        }}
        onDragEnter={handleFileDragEnter}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        {isFileDragActive && (
          <div
            className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/88 px-6 text-center backdrop-blur-sm"
            style={{
              right: isMapSidebarExpanded ? 'calc(max(45%, 500px) + 1rem)' : undefined
            }}
          >
            <div className="flex flex-col items-center">
              <Files className="h-14 w-14 text-primary mb-3" />
              <p className="text-base font-medium text-foreground">Drop layer file to import</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Supports {SUPPORTED_LAYER_IMPORT_DESCRIPTION}
              </p>
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="grow min-h-0">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="mx-auto w-full max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl px-4 pt-15 pb-6">
              {displayMessages.length === 0 && !displayIsLoading && <EmptyState />}

              {displayMessages.map((m, index: number) => {
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

              <ActiveExternalRuntimeRunPanel
                chatId={stableChatIdForUseChat || currentChatIdFromStore}
              />

              {shouldShowLoadingIndicator && <LoadingIndicator />}

              {/* Add a spacer div with screen height to ensure enough scroll space */}
              <div className="h-screen" />

              <div ref={messagesEndRef} className="h-1" />
            </div>
          </ScrollArea>
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 backdrop-blur-sm sticky bottom-0 flex justify-center">
          <div className="w-full max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl">
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
              selectedReasoningEffort={selectedReasoningEffort}
              availableReasoningBudgetPresets={availableReasoningBudgetPresets}
              selectedReasoningBudgetPreset={selectedReasoningBudgetPreset}
              availableReasoningEfforts={availableReasoningEfforts}
              onReasoningEffortChange={(effort) => {
                if (!activeReasoningPreferenceKey) {
                  return
                }

                setReasoningEffortByModel((prev) => ({
                  ...prev,
                  [activeReasoningPreferenceKey]: effort
                }))
              }}
              onReasoningBudgetPresetChange={(preset) => {
                if (!activeReasoningPreferenceKey) {
                  return
                }

                setReasoningBudgetPresetByModel((prev) => ({
                  ...prev,
                  [activeReasoningPreferenceKey]: preset
                }))
              }}
              isMapSidebarExpanded={isMapSidebarExpanded}
              onToggleMapSidebar={toggleMapSidebar}
              onOpenDatabase={handleOpenDatabase}
              layerFileImport={layerFileImport}
              banners={chatInputBanners}
            />
          </div>
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

      {pendingExternalRuntimeApproval && (
        <ExternalRuntimeApprovalDialog
          isOpen={true}
          request={pendingExternalRuntimeApproval}
          isResolving={isResolvingExternalRuntimeApproval}
          onApprove={(scope) => {
            void approveExternalRuntimeRequest(
              pendingExternalRuntimeApproval.runtimeId,
              pendingExternalRuntimeApproval.approvalId,
              scope
            ).catch((error) => {
              toast.error('Failed to approve runtime request', {
                description: error instanceof Error ? error.message : 'Unknown error'
              })
            })
          }}
          onDeny={() => {
            void denyExternalRuntimeRequest(
              pendingExternalRuntimeApproval.runtimeId,
              pendingExternalRuntimeApproval.approvalId
            ).catch((error) => {
              toast.error('Failed to deny runtime request', {
                description: error instanceof Error ? error.message : 'Unknown error'
              })
            })
          }}
        />
      )}

      {/* Layers Database Modal */}
      <LayersDatabaseModal isOpen={isDatabaseModalOpen} onOpenChange={setIsDatabaseModalOpen} />
    </div>
  )
}
