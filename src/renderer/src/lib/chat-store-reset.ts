/**
 * Chat Store Reset Utility
 *
 * Centralized utility for resetting chat-related Zustand stores when leaving a chat.
 * This ensures clean state when navigating between chats or leaving the chat interface.
 */

import { useChatHistoryStore } from '@/stores/chat-history-store'
import { useLayerStore } from '@/stores/layer-store'
import { useMapStore } from '@/stores/map-store'
import { useMcpPermissionStore } from '@/stores/mcp-permission-store'
import { useAgentOrchestrationStore } from '@/stores/agent-orchestration-store'

/**
 * Reset all chat-related stores to their initial state
 *
 * This function should be called when:
 * - Navigating away from the chat interface
 * - Switching between chats (including navigating to "New Chat")
 * - Logging out or closing the application
 */
export const resetChatStores = (): void => {
  try {
    // Reset chat history store - clear current chat context
    const chatHistoryStore = useChatHistoryStore.getState()
    chatHistoryStore.clearCurrentChat()

    // Reset layer store - clear session-imported layers and selections
    const layerStore = useLayerStore.getState()
    layerStore.clearSessionData()

    // Reset map store - clear map features and pending operations
    const mapStore = useMapStore.getState()
    mapStore.clearSessionData()

    // Reset MCP permission store - clear all chat permissions
    const mcpPermissionStore = useMcpPermissionStore.getState()
    // Clear all chat permissions but preserve pending permission state
    const currentPermissions = mcpPermissionStore.chatPermissions
    Object.keys(currentPermissions).forEach((chatId) => {
      mcpPermissionStore.clearChatPermissions(chatId)
    })

    // Reset agent orchestration store - clear active orchestration session
    const agentOrchestrationStore = useAgentOrchestrationStore.getState()
    agentOrchestrationStore.resetOrchestration()
  } catch (error) {}
}

/**
 * Reset stores for a specific chat ID
 *
 * This is useful when switching between chats without leaving the chat interface entirely.
 * More granular than resetChatStores().
 */
export const resetChatStoreForChatId = (chatId: string): void => {
  try {
    // Clear MCP permissions for specific chat
    const mcpPermissionStore = useMcpPermissionStore.getState()
    mcpPermissionStore.clearChatPermissions(chatId)

    // Clear session layers associated with this chat
    const layerStore = useLayerStore.getState()
    if (typeof layerStore.clearSessionLayersForChat === 'function') {
      layerStore.clearSessionLayersForChat(chatId)
    }
  } catch (error) {}
}

/**
 * Prepare for chat switch
 *
 * Helper function that combines clearing current chat data and optionally
 * preparing for a new chat context.
 */
export const prepareChatSwitch = (fromChatId?: string, toChatId?: string): void => {
  // If we have a specific chat we're leaving, clean up its specific data
  if (fromChatId) {
    resetChatStoreForChatId(fromChatId)
  }

  // Clear current chat context
  const chatHistoryStore = useChatHistoryStore.getState()
  chatHistoryStore.clearCurrentChat()

  // Additional preparation for new chat can be added here
  if (toChatId) {
    // Future: Pre-load chat-specific settings, permissions, etc.
  }
}
