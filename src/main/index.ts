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

// Import IPC handler registration functions
import { registerDbIpcHandlers } from './ipc/db-handlers'
import { registerChatIpcHandlers } from './ipc/chat-handlers'
import { registerSettingsIpcHandlers } from './ipc/settings-handlers'
import { registerKnowledgeBaseIpcHandlers } from './ipc/knowledge-base-handlers'
import { registerShellHandlers } from './ipc/shell-handlers'
import { registerMcpPermissionHandlers } from './ipc/mcp-permission-handlers'
import { registerPostgreSQLIpcHandlers } from './ipc/postgresql-handlers'

// Keep a reference to the service instance
let settingsServiceInstance: SettingsService
let chatServiceInstance: ChatService
let mcpClientServiceInstance: MCPClientService
let agentRunnerServiceInstance: AgentRunnerService
let llmToolServiceInstance: LlmToolService
let knowledgeBaseServiceInstance: KnowledgeBaseService
let mcpPermissionServiceInstance: McpPermissionService
let postgresqlServiceInstance: PostgreSQLService

function createWindow(): void {
  console.log('[Main Process] __dirname:', __dirname)
  const preloadPath = join(__dirname, '../preload/index.js')
  console.log('[Main Process] Calculated preload path:', preloadPath)

  if (fs.existsSync(preloadPath)) {
    console.log('[Main Process] Preload script FOUND at path:', preloadPath)
  } else {
    console.error('[Main Process] Preload script NOT FOUND at path:', preloadPath)
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
    console.warn('[Main Process] LlmToolService instance not available when setting main window.')
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
      "connect-src 'self' data: http://localhost:* ws://localhost:* https://*",
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
  llmToolServiceInstance = new LlmToolService(
    knowledgeBaseServiceInstance,
    mcpClientServiceInstance,
    mcpPermissionServiceInstance
  )
  agentRunnerServiceInstance = new AgentRunnerService(mcpClientServiceInstance)
  // ChatService depends on a fully initialized LlmToolService, so it's instantiated after LlmToolService.initialize()

  console.log('[Main Process] Core services instantiated.')

  // Initialize services that require async setup
  try {
    console.log('[Main Process] Initializing MCPClientService...')
    await mcpClientServiceInstance.ensureInitialized()
    console.log('[Main Process] MCPClientService initialized successfully.')

    console.log('[Main Process] Initializing KnowledgeBaseService...')
    await knowledgeBaseServiceInstance.initialize()
    console.log('[Main Process] KnowledgeBaseService initialized successfully.')

    console.log('[Main Process] Initializing LlmToolService...')
    await llmToolServiceInstance.initialize() // This will now wait for MCPClientService
    console.log('[Main Process] LlmToolService initialized successfully.')
  } catch (error) {
    console.error('[Main Process] Critical error during service initialization:', error)
    // Consider quitting the app or showing an error dialog if critical services fail
    app.quit()
    return // Exit if services fail to initialize
  }

  // Now that LlmToolService is initialized (including its MCP tools), instantiate ChatService
  chatServiceInstance = new ChatService(settingsServiceInstance, llmToolServiceInstance)
  console.log('[Main Process] ChatService instantiated after LlmToolService initialization.')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- Register IPC Handlers ---
  registerSettingsIpcHandlers(ipcMain, settingsServiceInstance)
  registerChatIpcHandlers(ipcMain, chatServiceInstance)
  registerDbIpcHandlers(ipcMain)
  registerKnowledgeBaseIpcHandlers(ipcMain, knowledgeBaseServiceInstance)
  registerShellHandlers(ipcMain)
  registerMcpPermissionHandlers(ipcMain, mcpPermissionServiceInstance)
  registerPostgreSQLIpcHandlers(ipcMain, postgresqlServiceInstance)
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
    console.log('[Main Process] App is quitting...')
    if (mcpClientServiceInstance) {
      console.log('[Main Process] Shutting down MCPClientService...')
      await mcpClientServiceInstance.shutdown()
    }
    if (agentRunnerServiceInstance) {
      console.log('[Main Process] Shutting down AgentRunnerService...')
      agentRunnerServiceInstance.terminateAllAgents()
    }
    if (knowledgeBaseServiceInstance) {
      console.log('[Main Process] Closing KnowledgeBaseService...')
      await knowledgeBaseServiceInstance.close()
    }
    if (mcpPermissionServiceInstance) {
      console.log('[Main Process] Cleaning up McpPermissionService...')
      mcpPermissionServiceInstance.cleanup()
    }
    if (postgresqlServiceInstance) {
      console.log('[Main Process] Cleaning up PostgreSQLService...')
      await postgresqlServiceInstance.cleanup()
    }
    console.log('[Main Process] All services shut down where applicable in main index.')
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
