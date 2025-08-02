import { IpcMain } from 'electron'
import { AgentRegistryService } from '../services/agent-registry-service'
import { PromptModuleService } from '../services/prompt-module-service'
import { IpcChannels, IPCResponse } from '../../shared/ipc-types'

/**
 * Register IPC handlers for agent-related functionality
 */
export function registerAgentIpcHandlers(
  ipcMain: IpcMain,
  agentRegistryService: AgentRegistryService,
  promptModuleService: PromptModuleService
): void {
  // Agent CRUD operations
  ipcMain.handle(
    IpcChannels.getAgents,
    async (): Promise<IPCResponse<any[]>> => {
      try {
        const agents = await agentRegistryService.getAllAgents()
        return { success: true, data: agents }
      } catch (error) {
        console.error('[AgentIpcHandler] Error getting all agents:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.getAgentById,
    async (_, id: string): Promise<IPCResponse<any>> => {
      try {
        const agent = await agentRegistryService.getAgentById(id)
        if (!agent) {
          return { success: false, error: `Agent with ID ${id} not found` }
        }
        return { success: true, data: agent }
      } catch (error) {
        console.error(`[AgentIpcHandler] Error getting agent with ID ${id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.createAgent,
    async (_, params: any): Promise<IPCResponse<any>> => {
      try {
        const newAgent = await agentRegistryService.createAgent(params)
        return { success: true, data: newAgent }
      } catch (error) {
        console.error('[AgentIpcHandler] Error creating agent:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.updateAgent,
    async (_, id: string, updates: any): Promise<IPCResponse<any>> => {
      try {
        const updatedAgent = await agentRegistryService.updateAgent(id, updates)
        return { success: true, data: updatedAgent }
      } catch (error) {
        console.error(`[AgentIpcHandler] Error updating agent ${id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.deleteAgent,
    async (_, id: string): Promise<IPCResponse<boolean>> => {
      try {
        const success = await agentRegistryService.deleteAgent(id)
        return { success: true, data: success }
      } catch (error) {
        console.error(`[AgentIpcHandler] Error deleting agent ${id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  // Prompt Module CRUD operations
  ipcMain.handle(
    IpcChannels.getPromptModules,
    async (): Promise<IPCResponse<any[]>> => {
      try {
        const modules = await promptModuleService.getAllModules()
        return { success: true, data: modules }
      } catch (error) {
        console.error('[AgentIpcHandler] Error getting all prompt modules:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.getPromptModuleById,
    async (_, id: string): Promise<IPCResponse<any>> => {
      try {
        const module = await promptModuleService.getModuleById(id)
        if (!module) {
          return { success: false, error: `Prompt module with ID ${id} not found` }
        }
        return { success: true, data: module }
      } catch (error) {
        console.error(`[AgentIpcHandler] Error getting prompt module with ID ${id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.createPromptModule,
    async (_, params: any): Promise<IPCResponse<any>> => {
      try {
        const newModule = await promptModuleService.createModule(params)
        return { success: true, data: newModule }
      } catch (error) {
        console.error('[AgentIpcHandler] Error creating prompt module:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.updatePromptModule,
    async (_, id: string, updates: any): Promise<IPCResponse<any>> => {
      try {
        const updatedModule = await promptModuleService.updateModule(id, updates)
        return { success: true, data: updatedModule }
      } catch (error) {
        console.error(`[AgentIpcHandler] Error updating prompt module ${id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    IpcChannels.deletePromptModule,
    async (_, id: string): Promise<IPCResponse<boolean>> => {
      try {
        const success = await promptModuleService.deleteModule(id)
        return { success: true, data: success }
      } catch (error) {
        console.error(`[AgentIpcHandler] Error deleting prompt module ${id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  // Prompt Assembly
  ipcMain.handle(
    IpcChannels.assemblePrompt,
    async (_, request: any): Promise<IPCResponse<any>> => {
      try {
        const result = await promptModuleService.assemblePrompt(request)
        return { success: true, data: result }
      } catch (error) {
        console.error('[AgentIpcHandler] Error assembling prompt:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  console.log('[AgentIpcHandler] Registered agent system IPC handlers')
}