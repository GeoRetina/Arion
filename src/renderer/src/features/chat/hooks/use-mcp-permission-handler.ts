import { useCallback, useEffect, useState } from 'react'
import { useMcpPermissionStore } from '@/stores/mcp-permission-store'
import type { McpServerConfig } from '../../../../../shared/ipc-types'

export const useMcpPermissionHandler = () => {
  const [mcpServerConfigs, setMcpServerConfigs] = useState<McpServerConfig[]>([])

  const { pendingPermission, resolvePendingPermission, hasPermission, setPendingPermission } =
    useMcpPermissionStore()

  // Fetch MCP server configurations on mount
  useEffect(() => {
    const fetchMcpConfigs = async () => {
      try {
        const configs = await window.ctg.settings.getMcpServerConfigs()
        setMcpServerConfigs(configs)
      } catch (error) {}
    }

    fetchMcpConfigs()
  }, [])

  // Get server path for a given serverId
  const getServerPath = (serverId: string): string | undefined => {
    const serverConfig = mcpServerConfigs.find((config) => config.id === serverId)
    if (!serverConfig) return undefined

    // For HTTP/SSE servers, return the URL
    if (serverConfig.url) {
      return serverConfig.url
    }

    // For stdio servers, return the first argument (typically the script path)
    if (serverConfig.args && serverConfig.args.length > 0) {
      return serverConfig.args[0]
    }

    // Fallback to command if no args (shouldn't happen in practice)
    return serverConfig.command
  }

  // Handle MCP permission dialog requests from main process
  const handleMcpPermissionRequest = useCallback(
    async (request: any) => {
      // Check if we already have permission for this tool in this chat
      const existingPermission = hasPermission(request.chatId, request.toolName)
      if (existingPermission !== null) {
        // Send response back to main process
        if (window.ctg?.mcp?.permissionResponse) {
          window.ctg.mcp.permissionResponse(request.requestId, existingPermission)
        }
        return
      }

      // Set pending permission to trigger the dialog UI
      setPendingPermission(request)
    },
    [hasPermission, setPendingPermission]
  )

  // Register the MCP permission dialog handler
  useEffect(() => {
    if (window.ctg?.mcp?.onShowPermissionDialog) {
      const unsubscribe = window.ctg.mcp.onShowPermissionDialog(handleMcpPermissionRequest)
      return () => unsubscribe()
    }
    return undefined
  }, [handleMcpPermissionRequest])

  return {
    pendingPermission,
    resolvePendingPermission,
    getServerPath
  }
}
