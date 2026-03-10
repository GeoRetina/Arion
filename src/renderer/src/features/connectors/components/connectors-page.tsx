import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  Database,
  Key,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldX,
  Timer,
  Trash2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type IntegrationConfigForRendererMap,
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

const ConnectorCard: React.FC<{
  definition: IntegrationDefinition
  isPending: boolean
  onConfigure: () => void
  onDisconnect: () => void
}> = ({ definition, isPending, onConfigure, onDisconnect }) => {
  const integration = definition.integration
  const isConnected = integration.status === 'connected'
  const isError = integration.status === 'error'
  const statusText = integration.status.replace('-', ' ')

  return (
    <Card className="h-full min-h-44 overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          {getIntegrationIcon(integration.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{integration.name}</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{integration.description}</p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-3">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </span>
          ) : (
            <>
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${getStatusStyles(integration.status)}`}
              />
              <span className="text-xs font-medium capitalize">{statusText}</span>
              {isError && <AlertCircle className="h-3 w-3 text-red-500" />}
            </>
          )}
        </div>
        {integration.message && isError && (
          <div className="mt-1 text-xs text-red-500 line-clamp-2">{integration.message}</div>
        )}
        <div className="mt-2 text-xs text-muted-foreground truncate">
          Last used: {integration.lastUsed}
        </div>
      </div>

      <div className="border-t border-border/40 px-4 py-2 flex items-center gap-1">
        {isConnected ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onConfigure}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Settings2 className="h-3 w-3" />
                  Edit
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDisconnect}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Working...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            onClick={onConfigure}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Loading...
              </>
            ) : (
              'Configure'
            )}
          </Button>
        )}
      </div>
    </Card>
  )
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
  const [activeTab, setActiveTab] = useState<'data-sources' | 'platforms'>('data-sources')
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const { runLogs, isRunLogsLoading, refreshRunLogs, clearRunLogs } = useConnectorRunLogs({
    limit: 30
  })

  const platformIds = useMemo<Set<IntegrationId>>(() => new Set(['google-earth-engine']), [])

  const dataSourceConfigs = useMemo(
    () => integrationConfigs.filter((d) => !platformIds.has(d.integration.id)),
    [integrationConfigs, platformIds]
  )

  const platformConfigs = useMemo(
    () => integrationConfigs.filter((d) => platformIds.has(d.integration.id)),
    [integrationConfigs, platformIds]
  )

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

      const resolvedConfigs = new Map<
        IntegrationId,
        IntegrationConfigForRendererMap[IntegrationId] | null
      >()
      await Promise.all(
        states
          .filter((state) => state.hasConfig)
          .map(async (state) => {
            const config = await window.ctg.integrations.getConfig(state.id)
            resolvedConfigs.set(
              state.id,
              (config as IntegrationConfigForRendererMap[IntegrationId] | null) || null
            )
          })
      )

      const nextConfigs = integrationRegistry.map((definition) => {
        const state = stateById.get(definition.integration.id)
        const storedConfig = resolvedConfigs.get(definition.integration.id)
        const fallbackConfig =
          storedConfig ||
          (definition.integration.connectionSettings as
            | IntegrationConfigForRendererMap[IntegrationId]
            | null) ||
          (definition.defaultConnectionSettings as unknown as
            | IntegrationConfigForRendererMap[IntegrationId]
            | null) ||
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

            <div className="rounded-lg border border-border/60">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors rounded-lg"
                onClick={() => setDiagnosticsOpen((prev) => !prev)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium">Diagnostics</span>
                  {!isRunLogsLoading && runLogs.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                      {runLogs.length}
                    </span>
                  )}
                  {isRunLogsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${diagnosticsOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {diagnosticsOpen && (
                <div className="border-t border-border/40 px-4 py-2">
                  <div className="flex items-center justify-end gap-1 mb-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => void refreshRunLogs()}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => void clearRunLogs()}
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </Button>
                  </div>

                  {runLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      No events yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {runLogs.slice(0, 8).map((log) => {
                        const isSuccess = log.outcome === 'success'
                        const isError = log.outcome === 'error'
                        const isDenied = log.outcome === 'policy_denied'

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
                          <div key={log.runId} className="flex items-center gap-2 py-1.5">
                            <div className={outcomeColor}>
                              <OutcomeIcon className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-xs font-medium truncate">
                              {log.integrationId}
                              <span className="text-muted-foreground font-normal">
                                {' / '}
                                {log.capability}
                              </span>
                            </span>
                            <span className="ml-auto flex items-center gap-1 shrink-0 text-xs text-muted-foreground tabular-nums">
                              <Clock className="h-3 w-3" />
                              {log.durationMs}ms
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as typeof activeTab)}
              className="w-full space-y-4"
            >
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="data-sources">Data Sources</TabsTrigger>
                <TabsTrigger value="platforms">Platforms</TabsTrigger>
              </TabsList>

              <TabsContent value="data-sources" className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {dataSourceConfigs.map((definition) => (
                    <ConnectorCard
                      key={definition.integration.id}
                      definition={definition}
                      isPending={pendingIntegrationId === definition.integration.id}
                      onConfigure={() => void openConfigureDialog(definition)}
                      onDisconnect={() => void handleDisconnect(definition.integration.id)}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="platforms" className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {platformConfigs.map((definition) => (
                    <ConnectorCard
                      key={definition.integration.id}
                      definition={definition}
                      isPending={pendingIntegrationId === definition.integration.id}
                      onConfigure={() => void openConfigureDialog(definition)}
                      onDisconnect={() => void handleDisconnect(definition.integration.id)}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
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
