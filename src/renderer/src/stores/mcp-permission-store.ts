import { create } from 'zustand'

interface McpPermissionState {
  // Map of chatId -> toolName -> boolean (granted/denied)
  chatPermissions: Record<string, Record<string, boolean>>
  
  // Current pending permission request
  pendingPermission: {
    chatId: string
    toolName: string
    serverId: string
    requestId: string
    resolve: (granted: boolean) => void
  } | null

  // Actions
  setPermission: (chatId: string, toolName: string, granted: boolean) => void
  hasPermission: (chatId: string, toolName: string) => boolean | null
  clearChatPermissions: (chatId: string) => void
  requestPermission: (chatId: string, toolName: string, serverId: string) => Promise<boolean>
  resolvePendingPermission: (granted: boolean, rememberChoice: boolean) => void
  setPendingPermission: (request: { chatId: string; toolName: string; serverId: string; requestId: string }) => void
}

export const useMcpPermissionStore = create<McpPermissionState>((set, get) => ({
  chatPermissions: {},
  pendingPermission: null,

  setPermission: (chatId: string, toolName: string, granted: boolean) => {
    set((state) => ({
      chatPermissions: {
        ...state.chatPermissions,
        [chatId]: {
          ...state.chatPermissions[chatId],
          [toolName]: granted
        }
      }
    }))
  },

  hasPermission: (chatId: string, toolName: string): boolean | null => {
    const chatPerms = get().chatPermissions[chatId]
    if (!chatPerms || !(toolName in chatPerms)) {
      return null // No permission set yet
    }
    return chatPerms[toolName]
  },

  clearChatPermissions: (chatId: string) => {
    set((state) => {
      const newPermissions = { ...state.chatPermissions }
      delete newPermissions[chatId]
      return { chatPermissions: newPermissions }
    })
  },

  requestPermission: async (chatId: string, toolName: string, serverId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      set({
        pendingPermission: {
          chatId,
          toolName,
          serverId,
          requestId: `${chatId}-${toolName}-${Date.now()}`,
          resolve
        }
      })
    })
  },

  resolvePendingPermission: (granted: boolean, rememberChoice: boolean) => {
    const pending = get().pendingPermission
    if (!pending) return

    // Remember choice if requested
    if (rememberChoice) {
      get().setPermission(pending.chatId, pending.toolName, granted)
    }

    // Send response back to main process
    if (window.ctg?.mcp?.permissionResponse) {
      window.ctg.mcp.permissionResponse(pending.requestId, granted)
    }

    // Resolve the promise
    pending.resolve(granted)
    
    // Clear pending request
    set({ pendingPermission: null })
  },

  setPendingPermission: (request: { chatId: string; toolName: string; serverId: string; requestId: string }) => {
    set({
      pendingPermission: {
        ...request,
        resolve: () => {} // This will be set by the IPC flow
      }
    })
  }
}))