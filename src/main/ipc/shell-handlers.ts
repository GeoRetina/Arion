import fs from 'fs'
import path from 'path'
import { app, shell, type IpcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../shared/ipc-types'
import { isPathInsideDirectory } from '../security/path-security'

const openPathRequestSchema = z
  .object({
    filePath: z.string().trim().min(1).max(4096)
  })
  .strict()

const resolveApprovedOpenPath = (rawFilePath: string): string => {
  const parsed = openPathRequestSchema.parse({ filePath: rawFilePath })
  const candidatePath = path.resolve(parsed.filePath)

  if (!fs.existsSync(candidatePath)) {
    throw new Error('Requested file path does not exist')
  }

  const userDataPath = app.getPath('userData')
  if (!isPathInsideDirectory(candidatePath, userDataPath)) {
    throw new Error('Opening paths outside the app data directory is not allowed')
  }

  return candidatePath
}

export function registerShellHandlers(ipcMainInstance: IpcMain): void {
  ipcMainInstance.handle(IpcChannels.shellOpenPath, async (_event, filePath: string) => {
    try {
      const safePath = resolveApprovedOpenPath(filePath)
      const errorMessage = await shell.openPath(safePath)
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
