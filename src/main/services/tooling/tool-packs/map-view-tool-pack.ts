import {
  setMapViewToolDefinition,
  setMapViewToolName,
  type SetMapViewParams
} from '../../../llm-tools/map-view-control-tools'
import type { ToolRegistry } from '../tool-registry'
import type { BrowserWindowProvider } from '../browser-window-provider'

export interface MapViewToolDependencies {
  getMainWindow: BrowserWindowProvider
}

export function registerMapViewTools(registry: ToolRegistry, deps: MapViewToolDependencies) {
  const { getMainWindow } = deps

  registry.register({
    name: setMapViewToolName,
    definition: setMapViewToolDefinition,
    category: 'map_view_control',
    execute: async ({ args }) => {
      const params = args as SetMapViewParams

      const mainWindow = getMainWindow()
      if (!mainWindow) {
        return {
          status: 'error',
          message: 'Internal error: Main window not available to send map view command.',
          params_received: params
        }
      }

      const ipcPayload: Partial<SetMapViewParams> = {}
      if (params.center) ipcPayload.center = params.center
      if (params.zoom !== undefined) ipcPayload.zoom = params.zoom
      if (params.pitch !== undefined) ipcPayload.pitch = params.pitch
      if (params.bearing !== undefined) ipcPayload.bearing = params.bearing
      if (params.animate !== undefined) ipcPayload.animate = params.animate

      mainWindow.webContents.send('ctg:map:setView', ipcPayload)

      return {
        status: 'success',
        message: `Request to set map view sent with parameters: ${JSON.stringify(ipcPayload)}. Check map for changes.`,
        applied_params: ipcPayload
      }
    }
  })
}
