import {
  openMapSidebarToolDefinition,
  openMapSidebarToolName
} from '../../../llm-tools/app-ui-control-tools'
import type { ToolRegistry } from '../tool-registry'
import type { BrowserWindowProvider } from '../browser-window-provider'

export interface AppUiToolDependencies {
  getMainWindow: BrowserWindowProvider
}

export function registerAppUiTools(registry: ToolRegistry, deps: AppUiToolDependencies) {
  const { getMainWindow } = deps

  registry.register({
    name: openMapSidebarToolName,
    definition: openMapSidebarToolDefinition,
    category: 'app_ui_control',
    execute: async () => {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('ctg:ui:setMapSidebarVisibility', { visible: true })
        return {
          status: 'success',
          message:
            'Request to open map sidebar sent. The user should see the map sidebar if it was closed.'
        }
      } else {
        return {
          status: 'error',
          message: 'Internal error: Main window not available to send UI command.'
        }
      }
    }
  })
}
