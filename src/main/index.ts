import { app, shell, BrowserWindow, ipcMain, session, dialog } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { SettingsService } from './services/settings-service'
import fs from 'fs'
import { ChatService } from './services/chat-service'
import { MCPClientService } from './services/mcp-client-service'
import { AgentRunnerService } from './services/agent-runner-service'
import { LlmToolService } from './services/llm-tool-service'
import { KnowledgeBaseService } from './services/knowledge-base-service'
import { McpPermissionService } from './services/mcp-permission-service'
import { SecurityApprovalService } from './services/security-approval-service'
import { PostgreSQLService } from './services/postgresql-service'
import { ConnectorHubService } from './services/connector-hub-service'
import { PromptModuleService } from './services/prompt-module-service'
import { AgentRegistryService } from './services/agent-registry-service'
import { ModularPromptManager } from './services/modular-prompt-manager'
import { AgentRoutingService } from './services/agent-routing-service'
import { SkillPackService } from './services/skill-pack-service'
import { PluginLoaderService } from './services/plugin/plugin-loader-service'
import { CodexRuntimeService } from './services/codex/codex-runtime-service'
import { ExternalRuntimeRegistry } from './services/external-runtimes/external-runtime-registry'
import { CodexExternalRuntimeAdapter } from './services/external-runtimes/adapters/codex-external-runtime-adapter'
import { ExternalRuntimeWorkspaceService } from './services/external-runtimes/external-runtime-workspace-service'
import { createConnectorExecutionRuntime } from './services/connectors/create-connector-execution-service'
import type { ConnectorExecutionService } from './services/connectors/connector-execution-service'
import {
  registerRasterProtocolPrivileges,
  registerRasterTileProtocol
} from './services/raster/raster-protocol-service'
import { getRasterTileService } from './services/raster/raster-tile-service'
import {
  registerVectorProtocolPrivileges,
  registerVectorAssetProtocol
} from './services/vector/vector-protocol-service'
import { parseHttpsUrl } from './security/path-security'
import { buildStartupErrorDetail } from './lib/startup-error'

// Import IPC handler registration functions
import { registerDbIpcHandlers } from './ipc/db-handlers'
import { registerChatIpcHandlers } from './ipc/chat-handlers'
import { registerSettingsIpcHandlers } from './ipc/settings-handlers'
import { registerKnowledgeBaseIpcHandlers } from './ipc/knowledge-base-handlers'
import { registerShellHandlers } from './ipc/shell-handlers'
import { registerMcpPermissionHandlers } from './ipc/mcp-permission-handlers'
import { registerSecurityApprovalHandlers } from './ipc/security-approval-handlers'
import { registerPostgreSQLIpcHandlers } from './ipc/postgresql-handlers'
import { registerConnectorIpcHandlers } from './ipc/connector-handlers'
import {
  registerLayerHandlers,
  getLayerDbManager,
  getRuntimeLayerSnapshot
} from './ipc/layer-handlers'
import { registerAgentIpcHandlers } from './ipc/agent-handlers'
import { registerToolIpcHandlers } from './ipc/tool-handlers'
import { registerExternalRuntimeIpcHandlers } from './ipc/external-runtime-handlers'

// Keep a reference to the service instance
let settingsServiceInstance: SettingsService
let chatServiceInstance: ChatService
let mcpClientServiceInstance: MCPClientService
let agentRunnerServiceInstance: AgentRunnerService
let llmToolServiceInstance: LlmToolService
let knowledgeBaseServiceInstance: KnowledgeBaseService
let mcpPermissionServiceInstance: McpPermissionService
let securityApprovalServiceInstance: SecurityApprovalService
let postgresqlServiceInstance: PostgreSQLService
let connectorHubServiceInstance: ConnectorHubService
let promptModuleServiceInstance: PromptModuleService
let agentRegistryServiceInstance: AgentRegistryService
let modularPromptManagerInstance: ModularPromptManager
let agentRoutingServiceInstance: AgentRoutingService
let skillPackServiceInstance: SkillPackService
let pluginLoaderServiceInstance: PluginLoaderService
let connectorExecutionServiceInstance: ConnectorExecutionService
let codexRuntimeServiceInstance: CodexRuntimeService
let externalRuntimeRegistryInstance: ExternalRuntimeRegistry
let hasShownStartupErrorDialog = false

registerRasterProtocolPrivileges()
registerVectorProtocolPrivileges()

const safeGetAppValue = (getter: () => string): string | null => {
  try {
    return getter()
  } catch {
    return null
  }
}

const showStartupErrorDialog = (error: unknown): void => {
  if (hasShownStartupErrorDialog) {
    return
  }

  hasShownStartupErrorDialog = true

  const detail = buildStartupErrorDetail(error, {
    appPath: safeGetAppValue(() => app.getAppPath()),
    userDataPath: safeGetAppValue(() => app.getPath('userData'))
  })

  dialog.showErrorBox('Arion could not start', detail)
}

const resolveAllowedDevOrigin = (): string | null => {
  if (!is.dev || !process.env['ELECTRON_RENDERER_URL']) {
    return null
  }

  try {
    return new URL(process.env['ELECTRON_RENDERER_URL']).origin
  } catch {
    return null
  }
}

const resolveAllowedProdRendererEntryUrl = (): string => {
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

const normalizeFileUrlPathname = (url: URL): string => {
  return process.platform === 'win32' ? url.pathname.toLowerCase() : url.pathname
}

const canNavigateToUrl = (
  targetUrl: string,
  allowedDevOrigin: string | null,
  allowedProdRendererEntryUrl: string
): boolean => {
  try {
    const parsed = new URL(targetUrl)
    if (allowedDevOrigin) {
      return parsed.origin === allowedDevOrigin
    }

    if (parsed.protocol !== 'file:') {
      return false
    }

    const allowedProdUrl = new URL(allowedProdRendererEntryUrl)
    return normalizeFileUrlPathname(parsed) === normalizeFileUrlPathname(allowedProdUrl)
  } catch {
    return false
  }
}

function createWindow(): void {
  const preloadPath = join(__dirname, '../preload/index.js')
  const allowedDevOrigin = resolveAllowedDevOrigin()
  const allowedProdRendererEntryUrl = resolveAllowedProdRendererEntryUrl()

  if (!fs.existsSync(preloadPath)) {
    console.warn('Preload script not found at:', preloadPath)
  }

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 768,
    show: false,
    autoHideMenuBar: true,
    title: 'Arion',
    icon: icon,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Add a small delay to ensure the UI is fully initialized before showing
    setTimeout(() => {
      mainWindow.show()
    }, 200)
  })

  if (llmToolServiceInstance) {
    llmToolServiceInstance.setMainWindow(mainWindow)
  } else {
    console.warn('LlmToolService not initialized when creating window')
  }

  if (securityApprovalServiceInstance) {
    securityApprovalServiceInstance.setMainWindow(mainWindow)
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const safeExternalUrl = parseHttpsUrl(details.url)
    if (safeExternalUrl) {
      void shell.openExternal(safeExternalUrl.toString())
    } else {
      console.warn(`[Security] Blocked external URL from renderer: ${details.url}`)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (canNavigateToUrl(targetUrl, allowedDevOrigin, allowedProdRendererEntryUrl)) {
      return
    }

    event.preventDefault()
    console.warn(`[Security] Blocked navigation to: ${targetUrl}`)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function initializeApplication(): Promise<void> {
  app.setName('Arion')
  electronApp.setAppUserModelId('com.arion')

  // --- Content Security Policy (CSP) ---
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const connectSrc = ["'self'", 'https:', 'wss:', 'arion-raster:', 'arion-vector:']
    const scriptSrc = ["'self'"]
    if (is.dev) {
      connectSrc.push('http://localhost:*', 'ws://localhost:*')
      // Vite/React fast refresh injects an inline preamble in development.
      scriptSrc.push("'unsafe-inline'", "'unsafe-eval'")
    }

    const cspDirectives = [
      "default-src 'self'",
      `script-src ${scriptSrc.join(' ')}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://* arion-raster:",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc.join(' ')}`,
      "frame-src 'none'"
    ]
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')]
      }
    })
  })
  // --- End CSP ---

  // Instantiate services
  settingsServiceInstance = new SettingsService()
  mcpClientServiceInstance = new MCPClientService(settingsServiceInstance)
  knowledgeBaseServiceInstance = new KnowledgeBaseService(settingsServiceInstance)
  mcpPermissionServiceInstance = new McpPermissionService()
  securityApprovalServiceInstance = new SecurityApprovalService()
  postgresqlServiceInstance = new PostgreSQLService()
  connectorHubServiceInstance = new ConnectorHubService(postgresqlServiceInstance)
  void connectorHubServiceInstance.restoreRuntimeConnections()
  const connectorExecutionRuntime = createConnectorExecutionRuntime({
    settingsService: settingsServiceInstance,
    connectorHubService: connectorHubServiceInstance,
    postgresqlService: postgresqlServiceInstance,
    mcpClientService: mcpClientServiceInstance
  })
  connectorExecutionServiceInstance = connectorExecutionRuntime.executionService
  codexRuntimeServiceInstance = new CodexRuntimeService(settingsServiceInstance, {
    workspaceService: new ExternalRuntimeWorkspaceService(
      () => getRuntimeLayerSnapshot(),
      () => app.getPath('userData')
    )
  })
  externalRuntimeRegistryInstance = new ExternalRuntimeRegistry()
  externalRuntimeRegistryInstance.register(
    new CodexExternalRuntimeAdapter(settingsServiceInstance, codexRuntimeServiceInstance)
  )

  // Instantiate agent system services
  promptModuleServiceInstance = new PromptModuleService()
  agentRegistryServiceInstance = new AgentRegistryService(promptModuleServiceInstance)
  skillPackServiceInstance = new SkillPackService({
    getUserDataPath: () => app.getPath('userData'),
    getAppPath: () => app.getAppPath(),
    getResourcesPath: () => process.resourcesPath,
    getCwd: () => process.cwd()
  })
  pluginLoaderServiceInstance = new PluginLoaderService({
    settingsService: settingsServiceInstance,
    environment: {
      getUserDataPath: () => app.getPath('userData'),
      getAppPath: () => app.getAppPath(),
      getResourcesPath: () => process.resourcesPath,
      getCwd: () => process.cwd()
    }
  })

  // Create llmToolService initially without agent services
  llmToolServiceInstance = new LlmToolService(
    knowledgeBaseServiceInstance,
    mcpClientServiceInstance,
    mcpPermissionServiceInstance,
    undefined, // agentRegistryService - will be set later
    undefined, // orchestrationService - will be set later
    postgresqlServiceInstance,
    pluginLoaderServiceInstance,
    connectorExecutionServiceInstance,
    settingsServiceInstance,
    externalRuntimeRegistryInstance
  )

  agentRunnerServiceInstance = new AgentRunnerService(mcpClientServiceInstance)
  modularPromptManagerInstance = new ModularPromptManager(
    promptModuleServiceInstance,
    agentRegistryServiceInstance,
    skillPackServiceInstance
  )

  // ChatService depends on a fully initialized LlmToolService, so it's instantiated after LlmToolService.initialize()
  await mcpClientServiceInstance.ensureInitialized()

  await knowledgeBaseServiceInstance.initialize()

  await llmToolServiceInstance.initialize() // This will now wait for MCPClientService

  await promptModuleServiceInstance.initialize()

  await agentRegistryServiceInstance.initialize()

  await modularPromptManagerInstance.initialize()

  // Now that all services are initialized, instantiate ChatService
  chatServiceInstance = new ChatService(
    settingsServiceInstance,
    llmToolServiceInstance,
    modularPromptManagerInstance,
    agentRegistryServiceInstance, // Pass the agent registry to ChatService
    knowledgeBaseServiceInstance,
    () => externalRuntimeRegistryInstance.listRuntimes()
  )

  // Instantiate AgentRoutingService after ChatService and other required services
  agentRoutingServiceInstance = new AgentRoutingService(
    agentRegistryServiceInstance,
    chatServiceInstance,
    llmToolServiceInstance
  )

  await agentRoutingServiceInstance.initialize()

  // Now that all agent services are initialized, update the LlmToolService with them
  llmToolServiceInstance.setAgentServices(
    agentRegistryServiceInstance,
    agentRoutingServiceInstance.getOrchestrationService()
  )

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- Register IPC Handlers ---
  registerSettingsIpcHandlers(
    ipcMain,
    settingsServiceInstance,
    mcpClientServiceInstance,
    skillPackServiceInstance,
    pluginLoaderServiceInstance,
    llmToolServiceInstance,
    securityApprovalServiceInstance
  )
  registerExternalRuntimeIpcHandlers(ipcMain, externalRuntimeRegistryInstance)
  registerChatIpcHandlers(
    ipcMain,
    chatServiceInstance,
    agentRoutingServiceInstance,
    knowledgeBaseServiceInstance,
    getLayerDbManager(),
    externalRuntimeRegistryInstance
  ) // Pass routing service, knowledge base, and layer db manager
  registerDbIpcHandlers(ipcMain, {
    onDeleteChat: (chatId) =>
      connectorExecutionRuntime.qgisProcessService.clearWorkflowsForChat(chatId)
  })
  registerKnowledgeBaseIpcHandlers(ipcMain, knowledgeBaseServiceInstance)
  registerShellHandlers(ipcMain)
  registerMcpPermissionHandlers(ipcMain, mcpPermissionServiceInstance)
  registerSecurityApprovalHandlers(ipcMain, securityApprovalServiceInstance)
  registerPostgreSQLIpcHandlers(ipcMain, postgresqlServiceInstance)
  registerConnectorIpcHandlers(
    ipcMain,
    connectorHubServiceInstance,
    connectorExecutionServiceInstance
  )
  registerLayerHandlers()
  registerRasterTileProtocol(session.defaultSession, getRasterTileService())
  registerVectorAssetProtocol(session.defaultSession)
  registerAgentIpcHandlers(ipcMain, agentRegistryServiceInstance, promptModuleServiceInstance)
  registerToolIpcHandlers(ipcMain, llmToolServiceInstance)
  // --- End IPC Handler Registration ---

  // --- Custom IPC Handlers ---
  ipcMain.handle('ctg:get-app-version', () => {
    return app.getVersion()
  })
  // --- End Custom IPC Handlers ---

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('will-quit', async () => {
    if (mcpClientServiceInstance) {
      await mcpClientServiceInstance.shutdown()
    }
    if (agentRunnerServiceInstance) {
      agentRunnerServiceInstance.terminateAllAgents()
    }
    if (knowledgeBaseServiceInstance) {
      await knowledgeBaseServiceInstance.close()
    }
    if (mcpPermissionServiceInstance) {
      mcpPermissionServiceInstance.cleanup()
    }
    if (securityApprovalServiceInstance) {
      securityApprovalServiceInstance.cleanup()
    }
    if (postgresqlServiceInstance) {
      await postgresqlServiceInstance.cleanup()
    }
    if (connectorHubServiceInstance) {
      connectorHubServiceInstance.cleanup()
    }
    connectorExecutionRuntime.qgisProcessService.clearAllWorkflows()
    if (codexRuntimeServiceInstance) {
      codexRuntimeServiceInstance.shutdown()
    }
    await getRasterTileService().shutdown()
  })
}

void app
  .whenReady()
  .then(() => initializeApplication())
  .catch((error) => {
    console.error('Failed to start application:', error)
    showStartupErrorDialog(error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
