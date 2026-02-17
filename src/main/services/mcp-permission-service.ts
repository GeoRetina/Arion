import { BrowserWindow } from 'electron'

export class McpPermissionService {
  private mainWindow: BrowserWindow | null = null
  private pendingRequests = new Map<
    string,
    { resolve: (value: boolean) => void; reject: (reason?: any) => void }
  >()

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  async requestPermission(chatId: string, toolName: string, serverId: string): Promise<boolean> {
    if (!this.mainWindow) {
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
      void 0
    }
  }

  // Clean up all pending requests (e.g., on app shutdown or window close)
  cleanup() {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Application is shutting down'))
    }
    this.pendingRequests.clear()
  }
}
