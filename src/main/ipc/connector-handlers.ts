import { type IpcMain } from 'electron'
import {
  CONNECTOR_CAPABILITIES,
  type ConnectorApprovalMode,
  type ConnectorApprovalGrantRequest,
  IpcChannels,
  type ConnectorCapabilityRegistration,
  type IntegrationHealthCheckResult,
  type ConnectorRunRecord,
  type IntegrationId,
  type IntegrationStatus
} from '../../shared/ipc-types'
import type { ConnectorHubService } from '../services/connector-hub-service'
import type { ConnectorExecutionService } from '../services/connectors/connector-execution-service'

const APPROVAL_MODES = ['once', 'session'] as const
const isGrantApprovalMode = (mode: ConnectorApprovalMode): mode is 'once' | 'session' =>
  APPROVAL_MODES.includes(mode as 'once' | 'session')

const buildFailureResult = (
  message: string,
  status: IntegrationStatus = 'error'
): IntegrationHealthCheckResult => ({
  success: false,
  status,
  message,
  checkedAt: new Date().toISOString()
})

export function registerConnectorIpcHandlers(
  ipcMain: IpcMain,
  connectorHubService: ConnectorHubService,
  connectorExecutionService: ConnectorExecutionService
): void {
  ipcMain.handle(IpcChannels.integrationsGetStates, async () => {
    try {
      return await connectorHubService.getStates()
    } catch (error) {
      console.error('[IPC integrationsGetStates] Failed to fetch integration states:', error)
      return []
    }
  })

  ipcMain.handle(IpcChannels.integrationsGetConfig, async (_event, rawId: string) => {
    try {
      const id = connectorHubService.validateIntegrationId(rawId)
      return await connectorHubService.getConfig(id)
    } catch (error) {
      console.error('[IPC integrationsGetConfig] Failed to fetch integration config:', error)
      return null
    }
  })

  ipcMain.handle(
    IpcChannels.integrationsSaveConfig,
    async (_event, rawId: string, rawConfig: unknown) => {
      const id = connectorHubService.validateIntegrationId(rawId)
      await connectorHubService.saveConfig(id, rawConfig)
      return { success: true }
    }
  )

  ipcMain.handle(
    IpcChannels.integrationsTestConnection,
    async (_event, rawId: string, rawConfig?: unknown): Promise<IntegrationHealthCheckResult> => {
      const startedMs = Date.now()
      let integrationId: IntegrationId | null = null
      try {
        const id = connectorHubService.validateIntegrationId(rawId)
        integrationId = id
        const result = await connectorHubService.testConnection(id, rawConfig)
        connectorExecutionService.logIntegrationLifecycleEvent({
          integrationId: id,
          event: 'testConnection',
          success: result.success,
          message: result.message,
          durationMs: Date.now() - startedMs
        })
        return result
      } catch (error) {
        console.error('[IPC integrationsTestConnection] Integration test failed:', error)
        const failureResult = buildFailureResult(
          error instanceof Error ? error.message : 'Failed to test integration connection'
        )
        if (integrationId) {
          connectorExecutionService.logIntegrationLifecycleEvent({
            integrationId,
            event: 'testConnection',
            success: false,
            message: failureResult.message,
            durationMs: Date.now() - startedMs
          })
        }
        return failureResult
      }
    }
  )

  ipcMain.handle(
    IpcChannels.integrationsConnect,
    async (_event, rawId: string, rawConfig?: unknown): Promise<IntegrationHealthCheckResult> => {
      const startedMs = Date.now()
      let integrationId: IntegrationId | null = null
      try {
        const id = connectorHubService.validateIntegrationId(rawId)
        integrationId = id
        const result = await connectorHubService.connect(id, rawConfig)
        connectorExecutionService.logIntegrationLifecycleEvent({
          integrationId: id,
          event: 'connect',
          success: result.success,
          message: result.message,
          durationMs: Date.now() - startedMs
        })
        return result
      } catch (error) {
        console.error('[IPC integrationsConnect] Integration connect failed:', error)
        const failureResult = buildFailureResult(
          error instanceof Error ? error.message : 'Failed to connect integration'
        )
        if (integrationId) {
          connectorExecutionService.logIntegrationLifecycleEvent({
            integrationId,
            event: 'connect',
            success: false,
            message: failureResult.message,
            durationMs: Date.now() - startedMs
          })
        }
        return failureResult
      }
    }
  )

  ipcMain.handle(IpcChannels.integrationsDisconnect, async (_event, rawId: string) => {
    const startedMs = Date.now()
    let integrationId: IntegrationId | null = null
    try {
      const id = connectorHubService.validateIntegrationId(rawId)
      integrationId = id
      const result = await connectorHubService.disconnect(id)
      connectorExecutionService.logIntegrationLifecycleEvent({
        integrationId: id,
        event: 'disconnect',
        success: result.success,
        message: result.message,
        durationMs: Date.now() - startedMs
      })
      return result
    } catch (error) {
      console.error('[IPC integrationsDisconnect] Integration disconnect failed:', error)
      const failureResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to disconnect integration'
      }
      if (integrationId) {
        connectorExecutionService.logIntegrationLifecycleEvent({
          integrationId,
          event: 'disconnect',
          success: false,
          message: failureResult.message,
          durationMs: Date.now() - startedMs
        })
      }
      return failureResult
    }
  })

  ipcMain.handle(
    IpcChannels.integrationsGetCapabilities,
    async (): Promise<ConnectorCapabilityRegistration[]> => {
      try {
        return connectorExecutionService.getCapabilities()
      } catch (error) {
        console.error(
          '[IPC integrationsGetCapabilities] Failed to load connector capabilities:',
          error
        )
        return []
      }
    }
  )

  ipcMain.handle(IpcChannels.integrationsGetRunLogs, async (_event, limit?: unknown) => {
    try {
      const safeLimit = typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined
      return connectorExecutionService.getRunLogs(safeLimit) as ConnectorRunRecord[]
    } catch (error) {
      console.error('[IPC integrationsGetRunLogs] Failed to load connector run logs:', error)
      return [] as ConnectorRunRecord[]
    }
  })

  ipcMain.handle(IpcChannels.integrationsClearRunLogs, async () => {
    try {
      connectorExecutionService.clearRunLogs()
      return { success: true }
    } catch (error) {
      console.error('[IPC integrationsClearRunLogs] Failed to clear connector run logs:', error)
      return { success: false }
    }
  })

  ipcMain.handle(
    IpcChannels.integrationsGrantApproval,
    async (_event, request: ConnectorApprovalGrantRequest) => {
      try {
        const id = connectorHubService.validateIntegrationId(request.integrationId)
        const capability = request.capability
        if (!CONNECTOR_CAPABILITIES.includes(capability)) {
          return {
            success: false,
            message: `Unsupported capability: ${String(request.capability)}`
          }
        }

        if (!isGrantApprovalMode(request.mode)) {
          return {
            success: false,
            message: `Unsupported approval mode: ${String(request.mode)}`
          }
        }

        if (typeof request.chatId !== 'string' || request.chatId.trim().length === 0) {
          return {
            success: false,
            message: 'chatId is required to grant connector approvals.'
          }
        }

        connectorExecutionService.grantApproval(request.mode, id, capability, request.chatId.trim())
        return {
          success: true,
          message: `Granted ${request.mode} approval for ${id}/${capability}`
        }
      } catch (error) {
        console.error('[IPC integrationsGrantApproval] Failed to grant connector approval:', error)
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to grant connector approval'
        }
      }
    }
  )

  ipcMain.handle(IpcChannels.integrationsClearApprovals, async (_event, chatId?: unknown) => {
    try {
      const normalizedChatId = typeof chatId === 'string' ? chatId : undefined
      connectorExecutionService.clearApprovals(normalizedChatId)
      return { success: true }
    } catch (error) {
      console.error('[IPC integrationsClearApprovals] Failed to clear connector approvals:', error)
      return { success: false }
    }
  })
}
