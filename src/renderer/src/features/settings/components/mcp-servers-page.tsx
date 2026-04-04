import React, { useCallback, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { McpSettingsManager, type McpSettingsManagerControls } from './mcp-settings-manager'

export default function McpServersPage(): React.JSX.Element {
  const [controls, setControls] = useState<McpSettingsManagerControls | null>(null)
  const handleControlsChange = useCallback((nextControls: McpSettingsManagerControls) => {
    setControls(nextControls)
  }, [])

  return (
    <ScrollArea className="h-full w-full">
      <div className="pt-14 pb-8 px-10 md:px-20">
        <div className="flex flex-col items-start gap-6">
          <div className="flex items-start justify-between gap-4 w-full">
            <div>
              <h1 className="text-3xl font-semibold mb-2">MCP Servers</h1>
              <p className="text-muted-foreground max-w-2xl">
                Configure and manage your Model Context Protocol (MCP) server connections. These
                servers provide external tools and data sources for your AI agents.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={controls?.onAddNew}
                disabled={!controls || !controls.canAddNew}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add MCP Server
              </Button>
              <Button
                variant="outline"
                onClick={controls?.onRefresh}
                disabled={!controls || !controls.canRefresh}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${controls && !controls.canRefresh ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            </div>
          </div>
          <div className="w-full">
            <McpSettingsManager onControlsChange={handleControlsChange} />
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
