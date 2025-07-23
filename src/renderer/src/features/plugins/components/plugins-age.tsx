import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, PlugZap, RefreshCw, Settings } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

// Define a type for the mock plugin data for clarity
interface MockPlugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  enabled: boolean
  type: string
  isCore: boolean // Added to distinguish core plugins
}

const PluginsPage: React.FC = () => {
  const [plugins, setPlugins] = useState<MockPlugin[]>([
    {
      id: 'plugin-1',
      name: 'GeoData Connector',
      description: 'Connect to external geographic data sources',
      version: '1.0.2',
      author: 'GeoRetina', // Changed author
      enabled: true, // Always enabled
      type: 'dataConnector',
      isCore: true // Mark as core
    },
    {
      id: 'plugin-2',
      name: 'Advanced Visualization',
      description: 'Additional map visualization tools and options',
      version: '0.8.5',
      author: 'GeoRetina', // Changed author
      enabled: true, // Always enabled
      type: 'visualizationProvider',
      isCore: true // Mark as core
    },
    {
      id: 'plugin-3',
      name: 'LLM Tools',
      description: 'Additional tools for language models',
      version: '1.1.0',
      author: 'GeoRetina', // Changed author
      enabled: true, // Always enabled
      type: 'mcpToolProvider',
      isCore: true // Mark as core
    }
    // Example of a user-installed plugin (for future reference)
    // {
    //   id: 'user-plugin-1',
    //   name: 'My Custom Tool',
    //   description: 'A plugin installed by the user',
    //   version: '0.1.0',
    //   author: 'Local User',
    //   enabled: true,
    //   type: 'customTool',
    //   isCore: false
    // }
  ])

  // Function to toggle plugin enabled state (will only apply to non-core plugins in the future)
  const togglePlugin = (id: string) => {
    setPlugins(
      plugins.map((plugin) =>
        plugin.id === id && !plugin.isCore ? { ...plugin, enabled: !plugin.enabled } : plugin
      )
    )
    // TODO: IPC call to update plugin status in DB for non-core plugins
    // window.ctg.plugins.togglePluginStatus(id, newEnabledState)
  }

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6 pb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Plugins</h1>
            <p className="text-muted-foreground max-w-2xl">
              Manage and configure plugins to extend Arion's functionality.
            </p>
          </div>

          <div className="w-full flex justify-between items-center">
            <h2 className="text-xl font-medium">Installed Plugins</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </Button>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Download className="h-4 w-4" />
                <span>Install New</span>
              </Button>
            </div>
          </div>

          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plugins.map((plugin) => (
              <Card key={plugin.id} className="overflow-hidden flex flex-col">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <PlugZap className="h-5 w-5 text-[var(--chart-5)]" />
                        {plugin.name}
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {plugin.description}
                      </CardDescription>
                    </div>
                    {/* Settings button might still be relevant for core plugins */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => {
                        console.log(`Open settings for ${plugin.id}`)
                      }}
                      title={`Settings for ${plugin.name}`}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-5 py-3 flex-grow">
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Version:</span>
                      <span>{plugin.version}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Author:</span>
                      <span>{plugin.author}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="capitalize">
                        {plugin.type.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <div className="px-5 py-3 bg-muted/30 border-t border-border/50 flex justify-between items-center mt-auto">
                  <span
                    className={`text-sm font-medium ${plugin.isCore ? 'text-sky-600' : plugin.enabled ? 'text-[var(--chart-5)]' : 'text-muted-foreground'}`}
                  >
                    {plugin.isCore ? 'Enabled (Core)' : plugin.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {!plugin.isCore && (
                    <Button
                      variant={plugin.enabled ? 'default' : 'outline'}
                      size="sm"
                      className={
                        plugin.enabled ? 'bg-[var(--chart-5)] hover:bg-[var(--chart-5)]/90' : ''
                      }
                      onClick={() => togglePlugin(plugin.id)}
                    >
                      {plugin.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

export default PluginsPage
