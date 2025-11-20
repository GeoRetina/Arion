import React, { useEffect, useState } from 'react'
import { McpServerConfig, McpServerTestResult } from '../../../../../shared/ipc-types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { McpServerForm } from './mcp-server-form'
import { buildNormalizedConfig } from './mcp-config-utils'

// Default empty state for a new/editing config
const initialFormState: Omit<McpServerConfig, 'id'> = {
  name: '',
  command: '',
  args: [],
  url: '',
  enabled: true
}

export function McpSettingsManager(): React.JSX.Element {
  const [configs, setConfigs] = useState<McpServerConfig[]>([])
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

  const loadConfigs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const fetchedConfigs = await window.ctg.settings.getMcpServerConfigs()
      setConfigs(fetchedConfigs || [])
    } catch (err) {
      setError('Failed to load configurations.')
      setConfigs([]) // Ensure configs is an array on error
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
        ;(currentConfig as any)[name] = val
      }
      return currentConfig
    })
  }

  const handleJsonInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJsonString = e.target.value
    setJsonString(newJsonString)
    setTestResult(null)
    // Attempt to parse and update editingConfig to keep form state somewhat in sync
    // This helps if user saves directly from JSON mode.
    try {
      const parsedJson = JSON.parse(newJsonString)
      if (isEditingExistingServer && editingConfig && 'id' in editingConfig) {
        // Preserve original ID if editing existing
        const { id: idFromJson, ...restOfParsedJson } = parsedJson
        setEditingConfig({ ...restOfParsedJson, id: editingConfig.id })
      } else {
        // Adding new: strip ID from parsedJson before setting editingConfig
        const { id, ...restOfParsedJson } = parsedJson
        setEditingConfig(restOfParsedJson)
      }
      setError(null) // Clear previous JSON errors
    } catch (jsonError) {
      setError(
        'Invalid JSON format. Form data may not be in sync until valid JSON is entered or mode is switched.'
      )
    }
  }

  const handleEnabledChange = (checked: boolean) => {
    if (!editingConfig) return
    setTestResult(null)
    setEditingConfig({ ...editingConfig, enabled: checked })
  }

  const handleSave = async () => {
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

  const handleDeleteClick = (id: string, name: string) => {
    setServerToDelete({ id, name })
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
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

  const handleDeleteCancel = () => {
    setServerToDelete(null)
  }

  const handleEdit = (config: McpServerConfig) => {
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

  const handleAddNew = () => {
    setEditingConfig({ ...initialFormState })
    setIsEditingExistingServer(false)
    setEditedServerId(null)
    setJsonString(JSON.stringify(initialFormState, null, 2))
    setInputMode('form')
    setConnectionType('stdio')
    setError(null)
    setTestResult(null)
  }

  const handleConnectionTypeChange = (value: 'stdio' | 'http') => {
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

  const handleTestConnection = async () => {
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
          err instanceof Error
            ? err.message
            : 'Failed to run MCP server test. Please try again.'
      })
    } finally {
      setIsTesting(false)
    }
  }

  const toggleInputMode = () => {
    if (inputMode === 'form') {
      // Switching FROM Form TO JSON
      // jsonString should be updated based on the current editingConfig state
      if (editingConfig) {
        setJsonString(JSON.stringify(editingConfig, null, 2))
      } else {
        // If no active form, show initial state in JSON
        setJsonString(JSON.stringify(initialFormState, null, 2))
      }
      setInputMode('json')
    } else {
      // Switching FROM JSON TO Form
      try {
        const parsedJson = JSON.parse(jsonString)
        if (isEditingExistingServer && editingConfig && 'id' in editingConfig) {
          // Editing existing: preserve original ID from editingConfig, take other fields from JSON.
          // User might have changed other fields in JSON, or even tried to change the ID. We ignore ID changes from JSON for an existing item.
          const { id: idFromUserJson, ...dataFromUserJson } = parsedJson
          setEditingConfig({ ...dataFromUserJson, id: editingConfig.id })
        } else {
          // Adding new: strip any ID from JSON before setting editingConfig.
          const { id, ...newConfigData } = parsedJson
          setEditingConfig(newConfigData)
          // isEditingExistingServer should already be false if we are in "add new" flow.
        }
        setError(null) // Clear JSON parse errors
        setInputMode('form')
      } catch (parseError) {
        setError('Cannot switch to form mode: Invalid JSON content. Form fields may not update.')
        // Optionally, do not switch mode if JSON is invalid: return;
      }
    }
  }

  const handleCancel = () => {
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
  }

  return (
    <div className="px-2 sm:px-4 pt-4 pb-4 max-w-4xl">
      <h2 className="text-xl font-semibold mb-4">Manage MCP Server Configurations</h2>
      {error && <p className="text-red-500 bg-red-100 p-2 rounded-md">Error: {error}</p>}
      <Button onClick={handleAddNew} disabled={!!editingConfig || isLoading}>
        Add New MCP Server
      </Button>

      {editingConfig && !isEditingExistingServer && !editedServerId && (
        <div className="mt-4">
          <McpServerForm
            editingConfig={editingConfig}
            inputMode={inputMode}
            connectionType={connectionType}
            jsonString={jsonString}
            isEditingExistingServer={isEditingExistingServer}
            isLoading={isLoading}
            isTesting={isTesting}
            testResult={testResult}
            onToggleInputMode={toggleInputMode}
            onConnectionTypeChange={handleConnectionTypeChange}
            onInputChange={handleInputChange}
            onJsonInputChange={handleJsonInputChange}
            onEnabledChange={handleEnabledChange}
            onSave={handleSave}
            onCancel={handleCancel}
            onTest={handleTestConnection}
          />
        </div>
      )}

      {isLoading && !configs.length && !editingConfig && <p>Loading configurations...</p>}

      <ScrollArea className="mt-6 max-h-[60vh] pr-4">
        <div className="space-y-3">
          {configs.length === 0 && !isLoading && !error && !editingConfig && (
            <p>No MCP server configurations found.</p>
          )}
          {configs.map((config) =>
            editedServerId === config.id && editingConfig && isEditingExistingServer ? (
              <div key={`${config.id}-edit-form`} className="my-3">
                <McpServerForm
                  editingConfig={editingConfig}
                  inputMode={inputMode}
                  connectionType={connectionType}
                  jsonString={jsonString}
                  isEditingExistingServer={isEditingExistingServer}
                  isLoading={isLoading}
                  isTesting={isTesting}
                  testResult={testResult}
                  onToggleInputMode={toggleInputMode}
                  onConnectionTypeChange={handleConnectionTypeChange}
                  onInputChange={handleInputChange}
                  onJsonInputChange={handleJsonInputChange}
                  onEnabledChange={handleEnabledChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  onTest={handleTestConnection}
                />
              </div>
            ) : (
              <div
                key={config.id}
                className="p-3 border rounded-md flex flex-col space-y-3 sm:flex-row sm:flex-wrap sm:justify-between sm:items-start sm:gap-3"
              >
                <div className="grow">
                  <p className="font-medium">
                    {config.name}{' '}
                    <span
                      className={`text-sm ${
                        config.enabled ? 'text-green-600' : 'text-muted-foreground'
                      }`}
                    >
                      ({config.enabled ? 'Enabled' : 'Disabled'})
                    </span>
                  </p>
                  {config.command && (
                    <p
                      className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-sm md:max-w-md mt-2"
                      title={`${config.command} ${config.args?.join(' ') || ''}`}
                    >
                      <span className="font-semibold">Command:</span> {config.command}{' '}
                      {config.args?.join(' ')}
                    </p>
                  )}
                  {config.url && (
                    <p
                      className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-sm md:max-w-md mt-2"
                      title={config.url}
                    >
                      <span className="font-semibold">URL:</span> {config.url}
                    </p>
                  )}
                  {config.command && config.args && config.args.length > 0 && (
                    <p
                      className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-sm md:max-w-md mt-1"
                      title={config.args[0]}
                    >
                      <span className="font-semibold">Server Path:</span> {config.args[0]}
                    </p>
                  )}
                </div>
                <div className="flex flex-col space-y-2 sm:flex-row sm:flex-wrap sm:gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(config)}
                    disabled={
                      isLoading || !!(editingConfig && !isEditingExistingServer && !editedServerId)
                    }
                    className="w-full sm:w-auto"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(config.id, config.name)}
                    disabled={
                      isLoading || !!(editingConfig && !isEditingExistingServer && !editedServerId)
                    }
                    className="w-full sm:w-auto"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
      </ScrollArea>

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
