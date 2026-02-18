import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
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
import { PostgreSQLService } from './services/postgresql-service'
import { ConnectorHubService } from './services/connector-hub-service'
import { PromptModuleService } from './services/prompt-module-service'
import { AgentRegistryService } from './services/agent-registry-service'
import { ModularPromptManager } from './services/modular-prompt-manager'
import { AgentRoutingService } from './services/agent-routing-service'
import { SkillPackService } from './services/skill-pack-service'
import { PluginLoaderService } from './services/plugin/plugin-loader-service'
import { createConnectorExecutionRuntime } from './services/connectors/create-connector-execution-service'
import type { ConnectorExecutionService } from './services/connectors/connector-execution-service'

// Import IPC handler registration functions
import { registerDbIpcHandlers } from './ipc/db-handlers'
import { registerChatIpcHandlers } from './ipc/chat-handlers'
import { registerSettingsIpcHandlers } from './ipc/settings-handlers'
import { registerKnowledgeBaseIpcHandlers } from './ipc/knowledge-base-handlers'
import { registerShellHandlers } from './ipc/shell-handlers'
import { registerMcpPermissionHandlers } from './ipc/mcp-permission-handlers'
import { registerPostgreSQLIpcHandlers } from './ipc/postgresql-handlers'
import { registerConnectorIpcHandlers } from './ipc/connector-handlers'
import { registerLayerHandlers, getLayerDbManager } from './ipc/layer-handlers'
import { registerAgentIpcHandlers } from './ipc/agent-handlers'
import { registerToolIpcHandlers } from './ipc/tool-handlers'

// Keep a reference to the service instance
let settingsServiceInstance: SettingsService
let chatServiceInstance: ChatService
let mcpClientServiceInstance: MCPClientService
let agentRunnerServiceInstance: AgentRunnerService
let llmToolServiceInstance: LlmToolService
let knowledgeBaseServiceInstance: KnowledgeBaseService
let mcpPermissionServiceInstance: McpPermissionService
let postgresqlServiceInstance: PostgreSQLService
let connectorHubServiceInstance: ConnectorHubService
let promptModuleServiceInstance: PromptModuleService
let agentRegistryServiceInstance: AgentRegistryService
let modularPromptManagerInstance: ModularPromptManager
let agentRoutingServiceInstance: AgentRoutingService
let skillPackServiceInstance: SkillPackService
let pluginLoaderServiceInstance: PluginLoaderService
let connectorExecutionServiceInstance: ConnectorExecutionService

function createWindow(): void {
  const preloadPath = join(__dirname, '../preload/index.js')

  if (fs.existsSync(preloadPath)) {
    // Preload script exists
  } else {
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
      sandbox: false,
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  app.setName('Arion')
  electronApp.setAppUserModelId('com.arion')

  // --- Content Security Policy (CSP) ---
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' data: blob: http://localhost:* ws://localhost:* https://*",
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
  postgresqlServiceInstance = new PostgreSQLService()
  connectorHubServiceInstance = new ConnectorHubService(postgresqlServiceInstance)
  connectorExecutionServiceInstance = createConnectorExecutionRuntime({
    settingsService: settingsServiceInstance,
    connectorHubService: connectorHubServiceInstance,
    postgresqlService: postgresqlServiceInstance,
    mcpClientService: mcpClientServiceInstance
  }).executionService

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
    settingsServiceInstance
  )

  agentRunnerServiceInstance = new AgentRunnerService(mcpClientServiceInstance)
  modularPromptManagerInstance = new ModularPromptManager(
    promptModuleServiceInstance,
    agentRegistryServiceInstance,
    skillPackServiceInstance
  )

  // ChatService depends on a fully initialized LlmToolService, so it's instantiated after LlmToolService.initialize()

  // Initialize services that require async setup
  try {
    await mcpClientServiceInstance.ensureInitialized()

    await knowledgeBaseServiceInstance.initialize()

    await llmToolServiceInstance.initialize() // This will now wait for MCPClientService

    await promptModuleServiceInstance.initialize()

    await agentRegistryServiceInstance.initialize()

    await modularPromptManagerInstance.initialize()
  } catch (error) {
    // Consider quitting the app or showing an error dialog if critical services fail
    console.error('Failed to initialize services:', error)
    app.quit()
    return // Exit if services fail to initialize
  }

  // Now that all services are initialized, instantiate ChatService
  chatServiceInstance = new ChatService(
    settingsServiceInstance,
    llmToolServiceInstance,
    modularPromptManagerInstance,
    agentRegistryServiceInstance, // Pass the agent registry to ChatService
    knowledgeBaseServiceInstance
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
    llmToolServiceInstance
  )
  registerChatIpcHandlers(
    ipcMain,
    chatServiceInstance,
    agentRoutingServiceInstance,
    knowledgeBaseServiceInstance,
    getLayerDbManager()
  ) // Pass routing service, knowledge base, and layer db manager
  registerDbIpcHandlers(ipcMain)
  registerKnowledgeBaseIpcHandlers(ipcMain, knowledgeBaseServiceInstance)
  registerShellHandlers(ipcMain)
  registerMcpPermissionHandlers(ipcMain, mcpPermissionServiceInstance)
  registerPostgreSQLIpcHandlers(ipcMain, postgresqlServiceInstance)
  registerConnectorIpcHandlers(
    ipcMain,
    connectorHubServiceInstance,
    connectorExecutionServiceInstance
  )
  registerLayerHandlers()
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
    if (postgresqlServiceInstance) {
      // PostgreSQLService may not have a close method, add if needed
    }

    if (agentRegistryServiceInstance) {
      // No explicit cleanup needed unless we add persistent connections
    }

    if (promptModuleServiceInstance) {
      // No explicit cleanup needed unless we add persistent connections
    }

    if (postgresqlServiceInstance) {
      await postgresqlServiceInstance.cleanup()
    }
    if (connectorHubServiceInstance) {
      connectorHubServiceInstance.cleanup()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
