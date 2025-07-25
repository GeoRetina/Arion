import { BrowserWindow } from 'electron'

export class McpPermissionService {
  private mainWindow: BrowserWindow | null = null
  private pendingRequests = new Map<string, { resolve: (value: boolean) => void; reject: (reason?: any) => void }>()

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  async requestPermission(chatId: string, toolName: string, serverId: string): Promise<boolean> {
    if (!this.mainWindow) {
      console.warn('[McpPermissionService] No main window available for permission dialog')
      return false
    }

    return new Promise<boolean>((resolve, reject) => {
      const requestId = `${chatId}-${toolName}-${Date.now()}`
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject })
      
      // Send permission request to renderer
      this.mainWindow!.webContents.send('ctg:mcp:showPermissionDialog', {
        chatId,
        toolName,
        serverId,
        requestId
      })
      
      // No timeout - users should have unlimited time to make security decisions
    })
  }

  resolvePermission(requestId: string, granted: boolean) {
    const pending = this.pendingRequests.get(requestId)
    if (pending) {
      this.pendingRequests.delete(requestId)
      pending.resolve(granted)
    } else {
      console.warn('[McpPermissionService] No pending request found for:', requestId)
    }
  }

  // Clean up all pending requests (e.g., on app shutdown or window close)
  cleanup() {
    console.log('[McpPermissionService] Cleaning up pending requests:', this.pendingRequests.size)
    for (const [requestId, pending] of this.pendingRequests) {
      console.log('[McpPermissionService] Rejecting pending request:', requestId)
      pending.reject(new Error('Application is shutting down'))
    }
    this.pendingRequests.clear()
  }
}