import { type IpcMain } from 'electron'
import {
  IpcChannels,
  type IntegrationHealthCheckResult,
  type IntegrationStatus
} from '../../shared/ipc-types'
import type { IntegrationHubService } from '../services/integration-hub-service'

const buildFailureResult = (
  message: string,
  status: IntegrationStatus = 'error'
): IntegrationHealthCheckResult => ({
  success: false,
  status,
  message,
  checkedAt: new Date().toISOString()
})

export function registerIntegrationIpcHandlers(
  ipcMain: IpcMain,
  integrationHubService: IntegrationHubService
): void {
  ipcMain.handle(IpcChannels.integrationsGetStates, async () => {
    try {
      return await integrationHubService.getStates()
    } catch (error) {
      console.error('[IPC integrationsGetStates] Failed to fetch integration states:', error)
      return []
    }
  })

  ipcMain.handle(IpcChannels.integrationsGetConfig, async (_event, rawId: string) => {
    try {
      const id = integrationHubService.validateIntegrationId(rawId)
      return await integrationHubService.getConfig(id)
    } catch (error) {
      console.error('[IPC integrationsGetConfig] Failed to fetch integration config:', error)
      return null
    }
  })

  ipcMain.handle(
    IpcChannels.integrationsSaveConfig,
    async (_event, rawId: string, rawConfig: unknown) => {
      const id = integrationHubService.validateIntegrationId(rawId)
      await integrationHubService.saveConfig(id, rawConfig)
      return { success: true }
    }
  )

  ipcMain.handle(
    IpcChannels.integrationsTestConnection,
    async (_event, rawId: string, rawConfig?: unknown): Promise<IntegrationHealthCheckResult> => {
      try {
        const id = integrationHubService.validateIntegrationId(rawId)
        return await integrationHubService.testConnection(id, rawConfig)
      } catch (error) {
        console.error('[IPC integrationsTestConnection] Integration test failed:', error)
        return buildFailureResult(
          error instanceof Error ? error.message : 'Failed to test integration connection'
        )
      }
    }
  )

  ipcMain.handle(
    IpcChannels.integrationsConnect,
    async (_event, rawId: string, rawConfig?: unknown): Promise<IntegrationHealthCheckResult> => {
      try {
        const id = integrationHubService.validateIntegrationId(rawId)
        return await integrationHubService.connect(id, rawConfig)
      } catch (error) {
        console.error('[IPC integrationsConnect] Integration connect failed:', error)
        return buildFailureResult(
          error instanceof Error ? error.message : 'Failed to connect integration'
        )
      }
    }
  )

  ipcMain.handle(IpcChannels.integrationsDisconnect, async (_event, rawId: string) => {
    try {
      const id = integrationHubService.validateIntegrationId(rawId)
      return await integrationHubService.disconnect(id)
    } catch (error) {
      console.error('[IPC integrationsDisconnect] Integration disconnect failed:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to disconnect integration'
      }
    }
  })
}
