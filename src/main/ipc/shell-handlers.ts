import { ipcMain, shell, type IpcMain } from 'electron'
import { IpcChannels } from '../../shared/ipc-types'

export function registerShellHandlers(ipcMainInstance: IpcMain): void {
  ipcMainInstance.handle(IpcChannels.shellOpenPath, async (_event, filePath: string) => {
    try {
      const errorMessage = await shell.openPath(filePath)
      if (errorMessage) {
        console.error(`[Shell Handler] Failed to open path ${filePath}: ${errorMessage}`)
        return { success: false, error: errorMessage }
      }
      console.log(`[Shell Handler] Successfully opened path: ${filePath}`)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[Shell Handler] Error opening path ${filePath}:`, message)
      return { success: false, error: message }
    }
  })

  console.log('[Main Process] ShellService IPC handlers registered by shell.handlers.ts.')
}
