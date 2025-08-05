import { type IpcMain, type IpcMainInvokeEvent } from 'electron'
import type { McpPermissionService } from '../services/mcp-permission-service'

interface McpPermissionRequest {
  chatId: string
  toolName: string
  serverId: string
}

export function registerMcpPermissionHandlers(
  ipcMain: IpcMain,
  mcpPermissionService: McpPermissionService
): void {
  ipcMain.handle(
    'ctg:mcp:requestPermission',
    async (_event: IpcMainInvokeEvent, request: McpPermissionRequest) => {
      return await mcpPermissionService.requestPermission(
        request.chatId,
        request.toolName,
        request.serverId
      )
    }
  )

  // Handle permission response from renderer
  ipcMain.handle(
    'ctg:mcp:permissionResponse',
    (_event: IpcMainInvokeEvent, requestId: string, granted: boolean) => {
      mcpPermissionService.resolvePermission(requestId, granted)
      return Promise.resolve()
    }
  )
}
