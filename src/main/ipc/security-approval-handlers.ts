import { type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { IpcChannels } from '../../shared/ipc-types'
import type { SecurityApprovalService } from '../services/security-approval-service'

export function registerSecurityApprovalHandlers(
  ipcMain: IpcMain,
  securityApprovalService: SecurityApprovalService
): void {
  ipcMain.handle(
    IpcChannels.securityApprovalResponse,
    (_event: IpcMainInvokeEvent, requestId: string, approved: boolean) => {
      securityApprovalService.resolveApproval(requestId, approved)
      return Promise.resolve()
    }
  )
}
