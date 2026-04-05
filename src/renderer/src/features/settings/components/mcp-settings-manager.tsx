import React, { useCallback, useEffect, useState } from 'react'
import {
  McpServerConfig,
  McpServerRuntimeStatus,
  McpServerTestResult
} from '../../../../../shared/ipc-types'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { McpServerForm } from './mcp-server-form'
import { buildNormalizedConfig } from './mcp-config-utils'
import { AlertCircle, Boxes, CheckCircle2, ChevronDown, Edit, Loader2, PlugZap, Trash2 } from 'lucide-react'

// Default empty state for a new/editing config
const initialFormState: Omit<McpServerConfig, 'id'> = {
  name: '',
  command: '',
  args: [],
  url: '',
  enabled: true
}

export interface McpSettingsManagerControls {
  canAddNew: boolean
  canRefresh: boolean
  onAddNew: () => void
  onRefresh: () => void
}

interface McpSettingsManagerProps {
  onControlsChange?: (controls: McpSettingsManagerControls) => void
}

function indexRuntimeStatuses(
  statuses: McpServerRuntimeStatus[]
): Record<string, McpServerRuntimeStatus> {
  return statuses.reduce<Record<string, McpServerRuntimeStatus>>((result, status) => {
    result[status.serverId] = status
    return result
  }, {})
}

export function McpSettingsManager({
  onControlsChange
}: McpSettingsManagerProps = {}): React.JSX.Element {
  const [configs, setConfigs] = useState<McpServerConfig[]>([])
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<string, McpServerRuntimeStatus>>({})
  const [editingConfig, setEditingConfig] = useState<
    McpServerConfig | Omit<McpServerConfig, 'id'> | null
  >(null)
  const [isEditingExistingServer, setIsEditingExistingServer] = useState(false)
  const [editedServerId, setEditedServerId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<McpServerTestResult | null>(null)
  const [inputMode, setInputMode] = useState<'form' | 'json'>('form')
  const [jsonString, setJsonString] = useState(() => JSON.stringify(initialFormState, null, 2))
  const [connectionType, setConnectionType] = useState<'stdio' | 'http'>('stdio')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [serverToDelete, setServerToDelete] = useState<{ id: string; name: string } | null>(null)
  const [togglingServerId, setTogglingServerId] = useState<string | null>(null)

  const loadConfigs = async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const [fetchedConfigs, fetchedStatuses] = await Promise.all([
        window.ctg.settings.getMcpServerConfigs(),
        window.ctg.settings.getMcpServerRuntimeStatuses()
      ])
      setConfigs(fetchedConfigs || [])
      setRuntimeStatuses(indexRuntimeStatuses(fetchedStatuses || []))
    } catch {
      setError('Failed to load configurations.')
      setConfigs([])
      setRuntimeStatuses({})
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  useEffect(() => {
    return window.ctg.settings.onMcpServerRuntimeStatusUpdated((status) => {
      setRuntimeStatuses((previousStatuses) => ({
        ...previousStatuses,
        [status.serverId]: status
      }))
    })
  }, [])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    if (!editingConfig) return
    setTestResult(null)
    const { name, value, type } = e.target
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value

    setEditingConfig((prev) => {
      if (!prev) return null
      // Explicitly type prev to help TypeScript with key access
      const currentConfig: McpServerConfig | Omit<McpServerConfig, 'id'> = { ...prev }

      if (name === 'argsString') {
        currentConfig.args = value
          .split(/[,\n]+/)
          .map((s) => s.trim())
          .filter((s) => s)
      } else if (name in currentConfig) {
        // Type assertion to satisfy TypeScript for dynamic key assignment
        ;(currentConfig as Record<string, unknown>)[name] = val
      }
      return currentConfig
    })
  }

  const handleJsonInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const newJsonString = e.target.value
    setJsonString(newJsonString)
    setTestResult(null)
    // Attempt to parse and update editingConfig to keep form state somewhat in sync
    // This helps if user saves directly from JSON mode.
    try {
      const parsedJson = JSON.parse(newJsonString)
      if (isEditingExistingServer && editingConfig && 'id' in editingConfig) {
        // Preserve original ID if editing existing
        const restOfParsedJson = { ...parsedJson }
        delete restOfParsedJson.id
        setEditingConfig({ ...restOfParsedJson, id: editingConfig.id })
      } else {
        // Adding new: strip ID from parsedJson before setting editingConfig
        const restOfParsedJson = { ...parsedJson }
        delete restOfParsedJson.id
        setEditingConfig(restOfParsedJson)
      }
      setError(null) // Clear previous JSON errors
    } catch {
      setError(
        'Invalid JSON format. Form data may not be in sync until valid JSON is entered or mode is switched.'
      )
    }
  }

  const handleEnabledChange = (checked: boolean): void => {
    if (!editingConfig) return
    setTestResult(null)
    setEditingConfig({ ...editingConfig, enabled: checked })
  }

  const handleSave = async (): Promise<void> => {
    if (!editingConfig) return
    setIsLoading(true)
    setError(null)
    setTestResult(null)

    const { config, error: buildError } = buildNormalizedConfig({
      editingConfig,
      inputMode,
      jsonString,
      isEditingExistingServer,
      connectionType
    })
    if (!config) {
      setIsLoading(false)
      setError(buildError || 'Cannot save: configuration is invalid.')
      return
    }

    try {
      if (isEditingExistingServer && 'id' in editingConfig) {
        // Editing existing server
        const { id } = editingConfig
        const result = await window.ctg.settings.updateMcpServerConfig(id, config)
        if (!result) {
          throw new Error('Failed to update configuration.')
        }
      } else {
        // Adding new server. Ensure no 'id' is passed.
        // editingConfig should be Omit<McpServerConfig, 'id'>
        const result = await window.ctg.settings.addMcpServerConfig(config)
        if (!result) {
          throw new Error('Failed to add configuration.')
        }
      }
      setEditingConfig(null)
      setIsEditingExistingServer(false)
      setJsonString(JSON.stringify(initialFormState, null, 2)) // Reset JSON input
      setEditedServerId(null)
      await loadConfigs() // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.')
    }
    setIsLoading(false)
  }

  const handleDeleteClick = (id: string, name: string): void => {
    setServerToDelete({ id, name })
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!serverToDelete) return

    const { id } = serverToDelete
    if (editedServerId === id) {
      setEditingConfig(null)
      setIsEditingExistingServer(false)
      setEditedServerId(null)
      setJsonString(JSON.stringify(initialFormState, null, 2))
      setError(null)
      setTestResult(null)
      setIsTesting(false)
    }
    setIsLoading(true)
    setError(null)
    try {
      const success = await window.ctg.settings.deleteMcpServerConfig(id)
      if (!success) {
        throw new Error('Failed to delete configuration on the server.')
      }
      await loadConfigs() // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete configuration.')
    }
    setIsLoading(false)
    setServerToDelete(null)
  }

  const handleDeleteCancel = (): void => {
    setServerToDelete(null)
  }

  const handleEdit = (config: McpServerConfig): void => {
    setEditingConfig({ ...config })
    setIsEditingExistingServer(true)
    setEditedServerId(config.id)
    setJsonString(JSON.stringify(config, null, 2))
    setInputMode('form')
    setConnectionType(config.url ? 'http' : 'stdio')
    setError(null)
    setTestResult(null)
    setIsTesting(false)
  }

  const handleAddNew = useCallback((): void => {
    setEditingConfig({ ...initialFormState })
    setIsEditingExistingServer(false)
    setEditedServerId(null)
    setJsonString(JSON.stringify(initialFormState, null, 2))
    setInputMode('form')
    setConnectionType('stdio')
    setError(null)
    setTestResult(null)
    setIsTesting(false)
  }, [])

  const handleConnectionTypeChange = (value: 'stdio' | 'http'): void => {
    setConnectionType(value)
    setTestResult(null)
    setEditingConfig((prev) => {
      if (!prev) return prev
      if (value === 'stdio') {
        return { ...prev, url: '' }
      }
      return { ...prev, command: '', args: [] }
    })
  }

  const handleTestConnection = async (): Promise<void> => {
    const { config, error: buildError } = buildNormalizedConfig({
      editingConfig,
      inputMode,
      jsonString,
      isEditingExistingServer,
      connectionType
    })
    if (!config) {
      setTestResult({
        success: false,
        error: buildError || 'Cannot test configuration.'
      })
      return
    }

    if (connectionType === 'stdio' && !config.command) {
      setTestResult({
        success: false,
        error: 'Enter an executable path before testing a stdio MCP server.'
      })
      return
    }

    if (connectionType === 'http' && !config.url) {
      setTestResult({
        success: false,
        error: 'Enter a server URL before testing a remote MCP server.'
      })
      return
    }

    setTestResult(null)
    setIsTesting(true)
    try {
      const testFn = window.ctg.settings.testMcpServerConfig
      if (typeof testFn !== 'function') {
        setTestResult({
          success: false,
          error:
            'Testing is unavailable in this build. Please restart the app to refresh the preload bridge.'
        })
        setIsTesting(false)
        return
      }

      const result = await testFn(config)
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        error:
          err instanceof Error ? err.message : 'Failed to run MCP server test. Please try again.'
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleInputModeChange = useCallback(
    (nextInputMode: 'form' | 'json'): void => {
      if (nextInputMode === inputMode) {
        return
      }

      if (nextInputMode === 'json') {
        // Keep the JSON editor seeded from the latest form state before switching views.
        if (editingConfig) {
          setJsonString(JSON.stringify(editingConfig, null, 2))
        } else {
          setJsonString(JSON.stringify(initialFormState, null, 2))
        }
        setInputMode('json')
        return
      }

      try {
        const parsedJson = JSON.parse(jsonString)
        if (isEditingExistingServer && editingConfig && 'id' in editingConfig) {
          // Preserve the existing record id even if the JSON payload includes one.
          const dataFromUserJson = { ...parsedJson }
          delete dataFromUserJson.id
          setEditingConfig({ ...dataFromUserJson, id: editingConfig.id })
        } else {
          const newConfigData = { ...parsedJson }
          delete newConfigData.id
          setEditingConfig(newConfigData)
        }
        setError(null)
        setInputMode('form')
      } catch {
        setError('Cannot switch to form mode: Invalid JSON content. Form fields may not update.')
      }
    },
    [editingConfig, inputMode, isEditingExistingServer, jsonString]
  )

  const handleCancel = useCallback((): void => {
    setEditingConfig(null)
    setIsEditingExistingServer(false)
    setEditedServerId(null)
    setJsonString(JSON.stringify(initialFormState, null, 2))
    setConnectionType('stdio')
    setError(null)
    setTestResult(null)
    setIsTesting(false)
    // Consider resetting inputMode to 'form' or leave as is.
    // Leaving as is allows canceling from JSON view without forcing back to form.
  }, [])

  const handleToggleEnabled = async (config: McpServerConfig): Promise<void> => {
    setError(null)
    setTestResult(null)
    setTogglingServerId(config.id)

    try {
      const updatedConfig = await window.ctg.settings.updateMcpServerConfig(config.id, {
        enabled: !config.enabled
      })

      if (updatedConfig) {
        setConfigs((previousConfigs) =>
          previousConfigs.map((currentConfig) =>
            currentConfig.id === updatedConfig.id ? updatedConfig : currentConfig
          )
        )
      } else {
        await loadConfigs()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration.')
      await loadConfigs()
    } finally {
      setTogglingServerId(null)
    }
  }

  const handleRefresh = useCallback((): void => {
    void loadConfigs()
  }, [])

  const hasPendingNewServer = !!(editingConfig && !isEditingExistingServer && !editedServerId)
  const canAddNew = !(!!editingConfig || isLoading)
  const canRefresh = !isLoading
  const isEditorOpen = !!editingConfig
  const isEditorBusy = isLoading || isTesting
  const editorTitle = isEditingExistingServer ? 'Edit MCP Server' : 'Add MCP Server'
  const editorDescription = isEditingExistingServer
    ? 'Update this MCP server configuration and save your changes.'
    : 'Create a new MCP server configuration for your agents.'
  const editingRuntimeStatus =
    isEditingExistingServer && editingConfig && 'id' in editingConfig
      ? runtimeStatuses[editingConfig.id] || null
      : null

  const handleEditorOpenChange = useCallback(
    (open: boolean): void => {
      if (!open && !isEditorBusy) {
        handleCancel()
      }
    },
    [handleCancel, isEditorBusy]
  )

  useEffect(() => {
    onControlsChange?.({
      canAddNew,
      canRefresh,
      onAddNew: handleAddNew,
      onRefresh: handleRefresh
    })
  }, [canAddNew, canRefresh, handleAddNew, handleRefresh, onControlsChange])

  return (
    <div className="w-full">
      {error && <p className="text-red-500 bg-red-100 p-2 rounded-md">Error: {error}</p>}

      {isLoading && !configs.length && !editingConfig && (
        <div className="w-full flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      <div className="w-full">
        {configs.length === 0 && !isLoading && !error && !editingConfig && (
          <div className="w-full text-center py-12 border border-dashed rounded-lg">
            <Boxes className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-1">No MCP server configurations found</p>
            <p className="text-sm text-muted-foreground">
              Add a server to start exposing external tools to your AI agents.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
          {configs.map((config) => (
            <McpServerCard
              key={config.id}
              config={config}
              runtimeStatus={runtimeStatuses[config.id]}
              isBusy={togglingServerId === config.id}
              disableActions={isLoading || hasPendingNewServer}
              onEdit={() => handleEdit(config)}
              onDelete={() => handleDeleteClick(config.id, config.name)}
              onToggleEnabled={() => void handleToggleEnabled(config)}
            />
          ))}
        </div>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={handleEditorOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="pr-8">
            <DialogTitle>{editorTitle}</DialogTitle>
            <DialogDescription>{editorDescription}</DialogDescription>
          </DialogHeader>
          {editingConfig && (
            <McpServerForm
              editingConfig={editingConfig}
              inputMode={inputMode}
              connectionType={connectionType}
              jsonString={jsonString}
              layout="dialog"
              isEditingExistingServer={isEditingExistingServer}
              isLoading={isLoading}
              isTesting={isTesting}
              runtimeStatus={editingRuntimeStatus}
              testResult={testResult}
              onInputModeChange={handleInputModeChange}
              onConnectionTypeChange={handleConnectionTypeChange}
              onInputChange={handleInputChange}
              onJsonInputChange={handleJsonInputChange}
              onEnabledChange={handleEnabledChange}
              onSave={handleSave}
              onCancel={handleCancel}
              onTest={handleTestConnection}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete MCP Server"
        description={`Are you sure you want to delete the MCP server "${serverToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        variant="destructive"
      />
    </div>
  )
}

interface McpServerCardProps {
  config: McpServerConfig
  runtimeStatus?: McpServerRuntimeStatus
  isBusy: boolean
  disableActions: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleEnabled: () => void
}

function McpServerCard({
  config,
  runtimeStatus,
  isBusy,
  disableActions,
  onEdit,
  onDelete,
  onToggleEnabled
}: McpServerCardProps): React.JSX.Element {
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false)
  const isRemote = Boolean(config.url)
  const connectionLabel = isRemote ? 'HTTP' : 'STDIO'
  const connectionDescription = isRemote ? 'Remote MCP server' : 'Local MCP process'
  const connectionValue = isRemote ? config.url : config.command
  const serverPath = !isRemote && config.args && config.args.length > 0 ? config.args[0] : null
  const extraArgs =
    !isRemote && Array.isArray(config.args) && config.args.length > 1
      ? config.args.slice(1).join(' ')
      : null
  const runtimeStatusLabel = runtimeStatus
    ? {
        connected: 'Connected',
        connecting: 'Connecting',
        disabled: 'Disabled',
        error: 'Error'
      }[runtimeStatus.state]
    : null
  const runtimeStatusClasses = runtimeStatus
    ? {
        connected: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
        connecting: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
        disabled: 'border-border/60 bg-muted/40 text-muted-foreground',
        error: 'border-destructive/20 bg-destructive/10 text-destructive'
      }[runtimeStatus.state]
    : null
  const runtimeStatusIcon = runtimeStatus
    ? {
        connected: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />,
        connecting: <Loader2 className="h-3.5 w-3.5 shrink-0 text-sky-400 animate-spin" />,
        disabled: <PlugZap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
        error: <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      }[runtimeStatus.state]
    : null
  const runtimeStatusSummary =
    runtimeStatus?.state === 'connected'
      ? runtimeStatus.toolCount === 1
        ? '1 tool discovered.'
        : `${runtimeStatus.toolCount ?? 0} tools discovered.`
      : runtimeStatus?.state === 'connecting'
        ? 'Starting the server and discovering tools.'
        : runtimeStatus?.state === 'disabled'
          ? 'This server is saved but currently disabled.'
          : null

  return (
    <Card
      className={`overflow-visible transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border ${
        !config.enabled ? 'opacity-60' : ''
      }`}
    >
      <div className="px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{config.name}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{connectionDescription}</p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-3">
        {!isRemote && connectionValue ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="font-mono text-xs max-w-full truncate">
              {connectionValue}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs border-border/70 bg-background text-foreground"
            >
              {connectionLabel}
            </Badge>
          </div>
        ) : !isRemote ? (
          <p className="text-xs text-muted-foreground">No connection target configured</p>
        ) : null}

        {isRemote && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="text-xs border-border/70 bg-background text-foreground"
            >
              {connectionLabel}
            </Badge>
          </div>
        )}

        {serverPath && (
          <p
            className="text-xs text-muted-foreground mt-2 line-clamp-2 break-all"
            title={serverPath}
          >
            {serverPath}
          </p>
        )}

        {extraArgs && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={extraArgs}>
            {extraArgs}
          </p>
        )}

        {config.url && (
          <p
            className="text-xs text-muted-foreground mt-2 line-clamp-2 break-all"
            title={config.url}
          >
            {config.url}
          </p>
        )}

        {runtimeStatus && runtimeStatus.state !== 'disabled' && (
          <div className="relative mt-3">
            <div className={`rounded-md border text-xs ${runtimeStatusClasses}`}>
              {runtimeStatus.state === 'error' && (runtimeStatus.error || runtimeStatus.detail) ? (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none"
                  onClick={() => setErrorDetailsOpen((v) => !v)}
                >
                  {runtimeStatusIcon}
                  <span className="font-medium shrink-0">{runtimeStatusLabel}</span>
                  <span className="truncate opacity-90">{runtimeStatus.error}</span>
                  <ChevronDown className={`ml-auto h-3 w-3 shrink-0 transition-transform ${errorDetailsOpen ? 'rotate-180' : ''}`} />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  {runtimeStatusIcon}
                  <span className="font-medium">{runtimeStatusLabel}</span>
                  {runtimeStatus.serverName && (
                    <span className="text-muted-foreground truncate">
                      &middot; {runtimeStatus.serverName}
                      {runtimeStatus.serverVersion ? ` v${runtimeStatus.serverVersion}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {errorDetailsOpen && runtimeStatus.state === 'error' && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-border/60 bg-card p-3 shadow-lg text-xs space-y-2">
                {runtimeStatus.error && (
                  <p className="text-destructive wrap-break-word text-[11px] leading-relaxed">
                    {runtimeStatus.error}
                  </p>
                )}
                {runtimeStatus.detail && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-[11px] leading-4 text-foreground/70 border border-border/40">
                    {runtimeStatus.detail}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/40 px-4 py-2 flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5"
          onClick={onEdit}
          disabled={disableActions || isBusy}
        >
          <Edit className="h-3 w-3" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          onClick={onDelete}
          disabled={disableActions || isBusy}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            checked={config.enabled}
            onCheckedChange={onToggleEnabled}
            disabled={disableActions || isBusy}
            aria-label={config.enabled ? 'Disable MCP server' : 'Enable MCP server'}
          />
        </div>
      </div>

    </Card>
  )
}
