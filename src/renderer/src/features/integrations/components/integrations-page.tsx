import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Link2,
  Cloud,
  Database,
  Key,
  Plus,
  ExternalLink,
  AlertCircle,
  Layers // Added for Google Earth Engine
} from 'lucide-react'

const IntegrationsPage: React.FC = () => {
  const [integrations, setIntegrations] = useState([
    // Removed MapBox API and AWS S3
    {
      id: 'integration-3',
      name: 'PostgreSQL/PostGIS',
      description: 'Connect to spatial databases for advanced GIS operations',
      type: 'database',
      status: 'disconnected',
      lastUsed: 'Never'
    },
    // Removed OpenWeatherMap
    {
      id: 'integration-5', // New ID
      name: 'Google Earth Engine',
      description: 'Access and analyze satellite imagery and geospatial datasets',
      type: 'cloud-platform', // New type for GEE
      status: 'not-configured', // Example status
      lastUsed: 'Never'
    }
  ])

  const getIntegrationIcon = (type: string) => {
    switch (type) {
      case 'api':
        return <Link2 className="h-5 w-5 text-blue-500" />
      case 'cloud':
        return <Cloud className="h-5 w-5 text-purple-500" />
      case 'database':
        return <Database className="h-5 w-5 text-orange-500" />
      case 'cloud-platform': // Added case for GEE
        return <Layers className="h-5 w-5 text-green-500" />
      default:
        return <Key className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-[var(--chart-5)] text-[var(--chart-5)]'
      case 'disconnected':
      case 'not-configured': // Added case for not-configured
        return 'bg-gray-400 text-gray-400'
      case 'error':
        return 'bg-red-500 text-red-500'
      default:
        return 'bg-gray-400 text-gray-400'
    }
  }

  return (
    <ScrollArea className="flex-1">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6 pb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Integrations</h1>
            <p className="text-muted-foreground max-w-2xl">
              Manage connections to external services and platforms.
            </p>
          </div>

          {/* Categories section REMOVED */}

          {/* Active Integrations */}
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center">
              <Button size="sm" className="flex items-center gap-1">
                <Plus className="h-4 w-4" />
                <span>Add New</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.map((integration) => (
                <Card key={integration.id} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex gap-3 items-start">
                      {getIntegrationIcon(integration.type)}
                      <div>
                        <CardTitle className="text-base">{integration.name}</CardTitle>
                        <CardDescription className="line-clamp-2">
                          {integration.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className={`h-2 w-2 rounded-full ${getStatusStyles(integration.status)}`}
                      ></div>
                      <span className="text-sm capitalize">
                        {integration.status.replace('-', ' ')}
                        {integration.status === 'error' && (
                          <span className="text-xs ml-1 text-red-500 inline-flex items-center">
                            <AlertCircle className="h-3 w-3 mr-1" /> Authentication failed
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Last used: {integration.lastUsed}
                    </div>
                  </CardContent>
                  <div className="px-5 py-3 border-t border-border/40 flex justify-between items-center">
                    <Button variant="ghost" size="sm" className="text-xs">
                      {integration.status === 'connected'
                        ? 'Disconnect'
                        : integration.status === 'not-configured' ||
                            integration.status === 'disconnected'
                          ? 'Setup / Connect'
                          : 'Retry'}
                    </Button>
                    <Button variant="outline" size="sm" className="flex items-center gap-1 text-xs">
                      <span>{integration.status === 'connected' ? 'Configure' : 'Details'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Documentation section REMOVED */}
        </div>
      </div>
    </ScrollArea>
  )
}

export default IntegrationsPage
