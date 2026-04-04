import { BrowserWindow } from 'electron'
import { IpcChannels, type SecurityApprovalRequest } from '../../shared/ipc-types'

type PendingSecurityApproval = {
  resolve: (approved: boolean) => void
  reject: (reason?: unknown) => void
}

export class SecurityApprovalService {
  private mainWindow: BrowserWindow | null = null
  private pendingRequests = new Map<string, PendingSecurityApproval>()
  private nextRequestId = 0

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  async requestApproval(request: Omit<SecurityApprovalRequest, 'requestId'>): Promise<boolean> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false
    }

    return await new Promise<boolean>((resolve, reject) => {
      const requestId = `security-approval-${Date.now()}-${this.nextRequestId++}`

      this.pendingRequests.set(requestId, { resolve, reject })
      this.mainWindow?.webContents.send(IpcChannels.securityApprovalRequestEvent, {
        ...request,
        requestId
      } satisfies SecurityApprovalRequest)
    })
  }

  resolveApproval(requestId: string, approved: boolean): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      return
    }

    this.pendingRequests.delete(requestId)
    pending.resolve(approved)
  }

  cleanup(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Application is shutting down'))
    }
    this.pendingRequests.clear()
  }
}
