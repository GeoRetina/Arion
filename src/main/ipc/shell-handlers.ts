import fs from 'fs'
import path from 'path'
import { app, dialog, shell, type IpcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../shared/ipc-types'
import {
  ensureLocalFilesystemPath,
  isNetworkPath,
  isPathInsideDirectory
} from '../security/path-security'

const openPathRequestSchema = z
  .object({
    filePath: z.string().trim().min(1).max(4096)
  })
  .strict()

const selectFileOptionsSchema = z
  .object({
    title: z.string().trim().min(1).max(256).optional(),
    buttonLabel: z.string().trim().min(1).max(64).optional(),
    filters: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(64),
            extensions: z.array(z.string().trim().min(1).max(32)).max(20)
          })
          .strict()
      )
      .max(10)
      .optional()
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

  ipcMainInstance.handle(IpcChannels.shellSelectFile, async (_event, rawOptions?: unknown) => {
    try {
      const options = selectFileOptionsSchema.parse(rawOptions ?? {})
      const result = await dialog.showOpenDialog({
        title: options.title,
        buttonLabel: options.buttonLabel,
        filters: options.filters,
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const selectedPath = ensureLocalFilesystemPath(result.filePaths[0], 'Selected file path')
      if (isNetworkPath(selectedPath)) {
        throw new Error('Selected file must be on a local filesystem path')
      }

      if (!fs.existsSync(selectedPath)) {
        throw new Error('Selected file does not exist')
      }

      return selectedPath
    } catch (error) {
      console.error('[IPC shellSelectFile] Failed to select file:', error)
      return null
    }
  })
}
