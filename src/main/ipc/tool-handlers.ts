import { type IpcMain } from 'electron'
import { IpcChannels } from '../../shared/ipc-types'
import { type LlmToolService } from '../services/llm-tool-service'

export function registerToolIpcHandlers(ipcMain: IpcMain, llmToolService: LlmToolService): void {
  // Get all available tools (builtin + MCP)
  ipcMain.handle(IpcChannels.toolsGetAllAvailable, async () => {
    try {
      const tools = llmToolService.getAllAvailableTools()
      return {
        success: true,
        data: tools
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get available tools'
      }
    }
  })
}
