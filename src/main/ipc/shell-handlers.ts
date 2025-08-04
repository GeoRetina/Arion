import { ipcMain, shell, type IpcMain } from 'electron'
import { IpcChannels } from '../../shared/ipc-types'

export function registerShellHandlers(ipcMainInstance: IpcMain): void {
  ipcMainInstance.handle(IpcChannels.shellOpenPath, async (_event, filePath: string) => {
    try {
      const errorMessage = await shell.openPath(filePath)
      if (errorMessage) {
        return { success: false, error: errorMessage }
      }
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
