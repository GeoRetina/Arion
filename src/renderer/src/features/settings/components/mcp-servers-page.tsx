import React from 'react'
import { McpSettingsManager } from './mcp-settings-manager' // Assuming it's in the same directory
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area' // Import ScrollArea and ScrollBar

export default function McpServersPage(): React.JSX.Element {
  return (
    <ScrollArea className="h-full w-full">
      {/* ScrollAreaViewport is implicitly created by ScrollArea but we manage its direct child for width */}
      {/* This div allows its children to define its minimum width, enabling horizontal scroll. */}
      {/* Padding is applied here to be part of the scrollable content. */}
      <div style={{ minWidth: 'max-content' }} className="p-4 md:p-6">
        <div className="flex flex-col items-start gap-8">
          <div>
            <h1 className="text-3xl font-semibold mb-2">MCP Servers</h1>
            <p className="text-muted-foreground max-w-2xl">
              Configure and manage your Model Context Protocol (MCP) server connections. These
              servers provide external tools and data sources for your AI agents.
            </p>
          </div>
          <div className="w-full">
            <McpSettingsManager />
          </div>
        </div>
      </div>
      <ScrollBar orientation="horizontal" /> {/* Explicitly add horizontal scrollbar if desired */}
      {/* Vertical scrollbar is usually automatic if content overflows vertically */}
    </ScrollArea>
  )
}
