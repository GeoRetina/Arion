import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Link2,
  Cloud,
  Database,
  Key,
  ExternalLink,
  AlertCircle,
  Layers // Added for Google Earth Engine
} from 'lucide-react'
import { integrationRegistry } from '../integrations'
import type { IntegrationConfig } from '../types/integration'
import { PostgreSQLConfigDialog } from './postgresql-config-dialog'
import { PostgreSQLConfig } from '../../../shared/ipc-types'

const IntegrationsPage: React.FC = () => {
  const [integrationConfigs, setIntegrationConfigs] =
    useState<IntegrationConfig[]>(integrationRegistry)
  const [isPostgreSQLConfigOpen, setIsPostgreSQLConfigOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationConfig | null>(null)

  const handleIntegrationAction = (
    integrationId: string,
    action: 'connect' | 'disconnect' | 'configure' | 'test'
  ) => {
    const config = integrationConfigs.find((c) => c.integration.id === integrationId)
    if (!config) return

    switch (action) {
      case 'connect':
        if (integrationId === 'postgresql-postgis') {
          handlePostgreSQLConnect(config)
        } else {
          config.onConnect?.()
        }
        break
      case 'disconnect':
        if (integrationId === 'postgresql-postgis') {
          handlePostgreSQLDisconnect(config)
        } else {
          config.onDisconnect?.()
        }
        break
      case 'configure':
        if (integrationId === 'postgresql-postgis') {
          setSelectedIntegration(config)
          setIsPostgreSQLConfigOpen(true)
        } else {
          config.onConfigure?.()
        }
        break
      case 'test':
        config.onTest?.()
        break
    }
  }

  const handlePostgreSQLConnect = async (config: IntegrationConfig) => {
    try {
      await config.onConnect?.()
      // Refresh the integration configs to update the UI
      setIntegrationConfigs((prev) =>
        prev.map((c) => (c.integration.id === config.integration.id ? config : c))
      )
    } catch (error) {
      // Handle error - could show a toast notification
    }
  }

  const handlePostgreSQLDisconnect = async (config: IntegrationConfig) => {
    try {
      await config.onDisconnect?.()
      // Refresh the integration configs to update the UI
      setIntegrationConfigs((prev) =>
        prev.map((c) => (c.integration.id === config.integration.id ? config : c))
      )
    } catch (error) {
      // Handle error - could show a toast notification
    }
  }

  const handlePostgreSQLSave = (newConfig: PostgreSQLConfig) => {
    if (selectedIntegration) {
      // Update the integration's connection settings
      selectedIntegration.integration.connectionSettings = newConfig

      // Update the integration configs
      setIntegrationConfigs((prev) =>
        prev.map((c) =>
          c.integration.id === selectedIntegration.integration.id ? selectedIntegration : c
        )
      )

      // Update the integration status
      selectedIntegration.integration.status = 'not-configured'
    }
  }

  const handlePostgreSQLTest = async (config: PostgreSQLConfig) => {
    return await window.ctg.postgresql.testConnection(config)
  }

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
      case 'coming-soon':
        return 'bg-blue-400 text-blue-400'
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrationConfigs.map((config) => {
                const integration = config.integration
                return (
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        disabled={integration.status === 'coming-soon'}
                        onClick={() => {
                          if (integration.status === 'connected') {
                            handleIntegrationAction(integration.id, 'disconnect')
                          } else if (
                            integration.status === 'not-configured' ||
                            integration.status === 'disconnected'
                          ) {
                            handleIntegrationAction(integration.id, 'connect')
                          } else if (integration.status === 'error') {
                            handleIntegrationAction(integration.id, 'test')
                          }
                        }}
                      >
                        {integration.status === 'connected'
                          ? 'Disconnect'
                          : integration.status === 'not-configured' ||
                              integration.status === 'disconnected'
                            ? 'Setup / Connect'
                            : integration.status === 'coming-soon'
                              ? 'Coming Soon'
                              : 'Retry'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 text-xs"
                        onClick={() => handleIntegrationAction(integration.id, 'configure')}
                        disabled={integration.status === 'coming-soon'}
                      >
                        <span>Configure</span>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Documentation section REMOVED */}
        </div>
      </div>

      {/* PostgreSQL Configuration Dialog */}
      {selectedIntegration && selectedIntegration.integration.id === 'postgresql-postgis' && (
        <PostgreSQLConfigDialog
          isOpen={isPostgreSQLConfigOpen}
          onClose={() => {
            setIsPostgreSQLConfigOpen(false)
            setSelectedIntegration(null)
          }}
          onSave={handlePostgreSQLSave}
          onTest={handlePostgreSQLTest}
          initialConfig={selectedIntegration.integration.connectionSettings as PostgreSQLConfig}
          title="PostgreSQL/PostGIS Configuration"
        />
      )}
    </ScrollArea>
  )
}

export default IntegrationsPage
