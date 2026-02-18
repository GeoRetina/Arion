import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  Key,
  Layers,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldX,
  Timer,
  Trash2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  type IntegrationConfig as SharedIntegrationConfig,
  type IntegrationConfigMap,
  type IntegrationHealthCheckResult,
  type IntegrationId,
  type PostgreSQLConfig,
  type PostgreSQLConnectionResult
} from '../../../../../shared/ipc-types'
import { integrationRegistry } from '../connectors'
import { useConnectorRunLogs } from '../hooks/use-connector-run-logs'
import type { IntegrationDefinition, IntegrationType } from '../types/connector'
import { IntegrationConfigDialog } from './connector-config-dialog'
import { PostgreSQLConfigDialog } from './postgresql-config-dialog'

const fallbackStatusStyle = 'bg-gray-400 text-gray-400'

const getStatusStyles = (status: string): string => {
  switch (status) {
    case 'connected':
      return 'bg-[var(--chart-5)] text-[var(--chart-5)]'
    case 'disconnected':
    case 'not-configured':
      return fallbackStatusStyle
    case 'coming-soon':
      return 'bg-blue-400 text-blue-400'
    case 'error':
      return 'bg-red-500 text-red-500'
    default:
      return fallbackStatusStyle
  }
}

const getIntegrationIcon = (type: IntegrationType): React.ReactNode => {
  switch (type) {
    case 'api':
      return <Link2 className="h-5 w-5 text-blue-500" />
    case 'cloud':
      return <Cloud className="h-5 w-5 text-cyan-500" />
    case 'database':
      return <Database className="h-5 w-5 text-orange-500" />
    case 'cloud-platform':
      return <Layers className="h-5 w-5 text-green-500" />
    default:
      return <Key className="h-5 w-5 text-gray-500" />
  }
}

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

const toPostgreSQLConfig = (value: unknown): PostgreSQLConfig => {
  const record = toRecord(value)
  const host =
    typeof record.host === 'string' && record.host.trim().length > 0 ? record.host : 'localhost'
  const database = typeof record.database === 'string' ? record.database : ''
  const username = typeof record.username === 'string' ? record.username : ''
  const password = typeof record.password === 'string' ? record.password : ''

  const rawPort = record.port
  const port =
    typeof rawPort === 'number' && Number.isFinite(rawPort)
      ? rawPort
      : typeof rawPort === 'string' && rawPort.trim().length > 0
        ? Number(rawPort)
        : 5432

  return {
    host,
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 5432,
    database,
    username,
    password,
    ssl: record.ssl === true
  }
}

const ConnectorsPage: React.FC = () => {
  const [integrationConfigs, setIntegrationConfigs] =
    useState<IntegrationDefinition[]>(integrationRegistry)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<IntegrationId | null>(null)
  const [isPostgreSQLConfigOpen, setIsPostgreSQLConfigOpen] = useState(false)
  const [postgresInitialConfig, setPostgresInitialConfig] = useState<PostgreSQLConfig | null>(null)
  const [isGenericConfigOpen, setIsGenericConfigOpen] = useState(false)
  const [genericInitialConfig, setGenericInitialConfig] = useState<Record<string, unknown>>({})
  const [pendingIntegrationId, setPendingIntegrationId] = useState<IntegrationId | null>(null)
  const { runLogs, isRunLogsLoading, refreshRunLogs, clearRunLogs } = useConnectorRunLogs({
    limit: 30
  })

  const selectedIntegration = useMemo(
    () =>
      selectedIntegrationId
        ? integrationConfigs.find((config) => config.integration.id === selectedIntegrationId) ||
          null
        : null,
    [integrationConfigs, selectedIntegrationId]
  )

  const hydrateIntegrationState = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const states = await window.ctg.integrations.getStates()
      const stateById = new Map(states.map((state) => [state.id, state]))

      const resolvedConfigs = new Map<IntegrationId, SharedIntegrationConfig | null>()
      await Promise.all(
        states
          .filter((state) => state.hasConfig)
          .map(async (state) => {
            const config = await window.ctg.integrations.getConfig(state.id)
            resolvedConfigs.set(state.id, (config as SharedIntegrationConfig | null) || null)
          })
      )

      const nextConfigs = integrationRegistry.map((definition) => {
        const state = stateById.get(definition.integration.id)
        const storedConfig = resolvedConfigs.get(definition.integration.id)
        const fallbackConfig =
          storedConfig ||
          (definition.integration.connectionSettings as SharedIntegrationConfig | null) ||
          (definition.defaultConnectionSettings as unknown as SharedIntegrationConfig | null) ||
          null

        return {
          ...definition,
          integration: {
            ...definition.integration,
            status: state?.status || definition.integration.status,
            lastUsed: state?.lastUsed || definition.integration.lastUsed,
            message: state?.message,
            connectionSettings: fallbackConfig
          }
        }
      })

      setIntegrationConfigs(nextConfigs)
    } catch (error) {
      toast.error('Failed to load integration states', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void hydrateIntegrationState()
  }, [hydrateIntegrationState])

  const handleDisconnect = async (integrationId: IntegrationId): Promise<void> => {
    setPendingIntegrationId(integrationId)
    try {
      const result = await window.ctg.integrations.disconnect(integrationId)
      if (!result.success) {
        throw new Error(result.message)
      }
      toast.success('Integration disconnected')
      await hydrateIntegrationState()
      await refreshRunLogs()
    } catch (error) {
      toast.error('Failed to disconnect integration', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setPendingIntegrationId(null)
    }
  }

  const openConfigureDialog = async (definition: IntegrationDefinition): Promise<void> => {
    setPendingIntegrationId(definition.integration.id)
    try {
      const storedConfig = await window.ctg.integrations.getConfig(definition.integration.id)
      const configRecord = toRecord(
        storedConfig ||
          definition.integration.connectionSettings ||
          definition.defaultConnectionSettings ||
          {}
      )
      const initialConfig = { ...configRecord }

      // Never prefill sensitive fields from stored credentials into the renderer form.
      for (const field of definition.fields || []) {
        if (field.sensitive) {
          initialConfig[field.key] = ''
        }
      }

      setSelectedIntegrationId(definition.integration.id)
      if (definition.integration.id === 'postgresql-postgis') {
        setPostgresInitialConfig(toPostgreSQLConfig(initialConfig))
        setIsPostgreSQLConfigOpen(true)
      } else {
        setGenericInitialConfig(initialConfig)
        setIsGenericConfigOpen(true)
      }
    } catch (error) {
      toast.error('Failed to load integration configuration', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setPendingIntegrationId(null)
    }
  }

  const handlePostgreSQLSave = async (config: PostgreSQLConfig): Promise<void> => {
    const result = await window.ctg.integrations.connect('postgresql-postgis', config)
    if (!result.success) {
      throw new Error(result.message)
    }
    toast.success('PostgreSQL/PostGIS connected')
    await hydrateIntegrationState()
    await refreshRunLogs()
  }

  const mapToPostgreSQLConnectionResult = (
    result: IntegrationHealthCheckResult
  ): PostgreSQLConnectionResult => {
    const details = toRecord(result.details)
    const version = typeof details.version === 'string' ? details.version : undefined
    const postgisVersion =
      details.postgisVersion === null || typeof details.postgisVersion === 'string'
        ? (details.postgisVersion as string | null)
        : undefined

    return {
      success: result.success,
      version,
      postgisVersion,
      message: result.message
    }
  }

  const handlePostgreSQLTest = async (
    config: PostgreSQLConfig
  ): Promise<PostgreSQLConnectionResult> => {
    const result = await window.ctg.integrations.testConnection('postgresql-postgis', config)
    await refreshRunLogs()
    return mapToPostgreSQLConnectionResult(result)
  }

  const handleGenericTest = async (
    config: Record<string, unknown>
  ): Promise<IntegrationHealthCheckResult> => {
    if (!selectedIntegration) {
      return {
        success: false,
        status: 'error',
        message: 'No integration selected',
        checkedAt: new Date().toISOString()
      }
    }

    const result = await window.ctg.integrations.testConnection(
      selectedIntegration.integration.id,
      config as unknown as IntegrationConfigMap[IntegrationId]
    )
    await refreshRunLogs()
    return result
  }

  const handleGenericSaveAndConnect = async (
    config: Record<string, unknown>
  ): Promise<IntegrationHealthCheckResult> => {
    if (!selectedIntegration) {
      return {
        success: false,
        status: 'error',
        message: 'No integration selected',
        checkedAt: new Date().toISOString()
      }
    }

    const result = await window.ctg.integrations.connect(
      selectedIntegration.integration.id,
      config as unknown as IntegrationConfigMap[IntegrationId]
    )

    if (result.success) {
      toast.success(`${selectedIntegration.integration.name} connected`)
    } else {
      toast.error('Failed to connect integration', {
        description: result.message
      })
    }

    await hydrateIntegrationState()
    await refreshRunLogs()
    return result
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-8 px-4 md:px-6">
        <div className="flex flex-col items-start gap-6 pb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Connectors</h1>
            <p className="text-muted-foreground max-w-2xl">
              Manage and validate connections to geospatial services and platforms.
            </p>
          </div>

          <div className="w-full flex flex-col gap-4">
            {isLoading && (
              <div className="w-full flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading connector states...
              </div>
            )}

            <Card className="surface-elevated">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Connector Diagnostics</CardTitle>
                    <CardDescription>
                      Recent connector tests, connection events, and capability runs.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void refreshRunLogs()}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void clearRunLogs()}
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 py-3">
                {isRunLogsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading diagnostics...
                  </div>
                ) : runLogs.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    No connector runs yet. Events will appear here as you test and use connectors.
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {runLogs.slice(0, 8).map((log) => {
                      const isSuccess = log.outcome === 'success'
                      const isError = log.outcome === 'error'
                      const isDenied = log.outcome === 'policy_denied'
                      const isTimeout = log.outcome === 'timeout'

                      const OutcomeIcon = isSuccess
                        ? CheckCircle2
                        : isError
                          ? XCircle
                          : isDenied
                            ? ShieldX
                            : Timer

                      const outcomeColor = isSuccess
                        ? 'text-green-500'
                        : isError
                          ? 'text-red-500'
                          : isDenied
                            ? 'text-yellow-500'
                            : 'text-orange-500'

                      return (
                        <div key={log.runId} className="flex items-start gap-3 py-2.5">
                          <div className={`mt-0.5 ${outcomeColor}`}>
                            <OutcomeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium truncate">
                                {log.integrationId}
                                <span className="text-muted-foreground font-normal">
                                  {' / '}
                                  {log.capability}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                                {log.backend && (
                                  <span className="rounded-full bg-muted px-2 py-0.5">
                                    {log.backend}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {log.durationMs}ms
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {log.message}
                            </p>
                            {log.errorCode && (
                              <span className="text-xs text-red-500 mt-0.5 inline-block">
                                Error: {log.errorCode}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrationConfigs.map((definition) => {
                const integration = definition.integration
                const isPending = pendingIntegrationId === integration.id
                const statusText = integration.status.replace('-', ' ')

                return (
                  <Card key={integration.id} className="overflow-hidden surface-elevated">
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
                      <div className="flex items-center gap-2 mb-2">
                        {integration.status === 'connected' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </span>
                        ) : (
                          <>
                            <div
                              className={`h-2 w-2 rounded-full ${getStatusStyles(integration.status)}`}
                            ></div>
                            <span className="text-sm capitalize">{statusText}</span>
                            {integration.status === 'error' && (
                              <AlertCircle className="h-3 w-3 text-red-500" />
                            )}
                          </>
                        )}
                      </div>
                      {integration.message && integration.status === 'error' && (
                        <div className="text-xs text-red-500 mb-2 line-clamp-2">
                          {integration.message}
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        Last used: {integration.lastUsed}
                      </div>
                    </CardContent>
                    <div className="px-5 py-3 border-t border-border/40 flex justify-end items-center gap-2">
                      {integration.status === 'connected' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20 hover:text-red-600"
                          onClick={() => void handleDisconnect(integration.id)}
                          disabled={isPending}
                        >
                          {isPending ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Disconnecting...
                            </>
                          ) : (
                            'Disconnect'
                          )}
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        className="flex items-center gap-1 text-xs"
                        onClick={() => void openConfigureDialog(definition)}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <span>{integration.status === 'connected' ? 'Edit' : 'Configure'}</span>
                            {integration.status === 'connected' && (
                              <Pencil className="h-2.5 w-2.5" />
                            )}
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedIntegration && selectedIntegration.integration.id === 'postgresql-postgis' && (
        <PostgreSQLConfigDialog
          isOpen={isPostgreSQLConfigOpen}
          onClose={() => {
            setIsPostgreSQLConfigOpen(false)
            setSelectedIntegrationId(null)
            setPostgresInitialConfig(null)
          }}
          onSave={handlePostgreSQLSave}
          onTest={handlePostgreSQLTest}
          initialConfig={
            postgresInitialConfig ||
            toPostgreSQLConfig(selectedIntegration.integration.connectionSettings)
          }
          title="PostgreSQL/PostGIS Configuration"
        />
      )}

      {selectedIntegration &&
        selectedIntegration.integration.id !== 'postgresql-postgis' &&
        selectedIntegration.fields && (
          <IntegrationConfigDialog
            isOpen={isGenericConfigOpen}
            onClose={() => {
              setIsGenericConfigOpen(false)
              setSelectedIntegrationId(null)
            }}
            integration={selectedIntegration.integration}
            fields={selectedIntegration.fields}
            initialConfig={genericInitialConfig}
            onTest={handleGenericTest}
            onSaveAndConnect={handleGenericSaveAndConnect}
          />
        )}
    </ScrollArea>
  )
}

export default ConnectorsPage
