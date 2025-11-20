import React from 'react'
import { McpServerConfig, McpServerTestResult } from '../../../../../shared/ipc-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { HelpTooltip } from '@/components/ui/help-tooltip'

interface McpServerFormProps {
  editingConfig: McpServerConfig | Omit<McpServerConfig, 'id'>
  inputMode: 'form' | 'json'
  connectionType: 'stdio' | 'http'
  jsonString: string
  isEditingExistingServer: boolean
  isLoading: boolean
  isTesting: boolean
  testResult: McpServerTestResult | null
  onToggleInputMode: () => void
  onConnectionTypeChange: (value: 'stdio' | 'http') => void
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onJsonInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onEnabledChange: (checked: boolean) => void
  onSave: () => void
  onCancel: () => void
  onTest: () => void
}

export function McpServerForm({
  editingConfig,
  inputMode,
  connectionType,
  jsonString,
  isEditingExistingServer,
  isLoading,
  isTesting,
  testResult,
  onToggleInputMode,
  onConnectionTypeChange,
  onInputChange,
  onJsonInputChange,
  onEnabledChange,
  onSave,
  onCancel,
  onTest
}: McpServerFormProps): React.JSX.Element {
  const currentArgsString = Array.isArray(editingConfig.args) ? editingConfig.args.join(', ') : ''

  return (
    <div className="p-4 border rounded-md mt-4 space-y-4">
      <h3 className="text-lg font-semibold">
        {isEditingExistingServer ? 'Edit' : 'Add New'} MCP Server Configuration
      </h3>
      <Button onClick={onToggleInputMode} variant="outline" className="mb-4">
        Switch to {inputMode === 'form' ? 'JSON' : 'Form'} Input
      </Button>

      {inputMode === 'form' ? (
        <>
          <div>
            <Label htmlFor="name" className="mb-1 block">
              Name
            </Label>
            <Input
              id="name"
              name="name"
              value={editingConfig.name || ''}
              onChange={onInputChange}
              placeholder="My Local GDAL Server"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Label htmlFor="connectionType">Connection Type</Label>
              <HelpTooltip>
                <div className="space-y-2">
                  <p className="font-medium">Connection Methods:</p>
                  <div className="text-xs space-y-2">
                    <div>
                      <p>
                        <strong>Local Process (stdio):</strong>
                      </p>
                      <p>
                        For Python scripts, executables, or local MCP servers that run as separate
                        processes
                      </p>
                    </div>
                    <div>
                      <p>
                        <strong>Remote Server (HTTP):</strong>
                      </p>
                      <p>For web-based MCP servers accessible via HTTP endpoints</p>
                    </div>
                  </div>
                </div>
              </HelpTooltip>
            </div>
            <Select
              value={connectionType}
              onValueChange={(value: 'stdio' | 'http') => onConnectionTypeChange(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select connection type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">Local Process (stdio)</SelectItem>
                <SelectItem value="http">Remote Server (HTTP)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Choose how to connect to your MCP server
            </p>
          </div>

          {connectionType === 'stdio' && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="command">Executable Path</Label>
                  <HelpTooltip>
                    <div className="space-y-2">
                      <p className="font-medium">Examples:</p>
                      <div className="text-xs space-y-1">
                        <p>
                          <strong>Python:</strong> /usr/bin/python or C:\Python39\python.exe
                        </p>
                        <p>
                          <strong>Binary:</strong> /usr/local/bin/gdal_mcp_server
                        </p>
                        <p>
                          <strong>Windows:</strong> C:\mcp\server.exe
                        </p>
                      </div>
                    </div>
                  </HelpTooltip>
                </div>
                <Input
                  id="command"
                  name="command"
                  value={editingConfig.command || ''}
                  onChange={onInputChange}
                  placeholder="path/to/your/python.exe"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Full path to the MCP server executable file. Use this for local servers that run
                  as separate processes.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="argsString">Command Arguments</Label>
                  <HelpTooltip>
                    <div className="space-y-2">
                      <p className="font-medium">Examples:</p>
                      <div className="text-xs space-y-1">
                        <p>
                          <strong>Python script:</strong> d:\my_mcp_servers\server.py --port 8080
                        </p>
                        <p>
                          <strong>With options:</strong> --verbose --config /path/config.json
                        </p>
                        <p>
                          <strong>Multiple args:</strong> script.py, --host, localhost, --debug
                        </p>
                      </div>
                    </div>
                  </HelpTooltip>
                </div>
                <Input
                  id="argsString"
                  name="argsString"
                  value={currentArgsString}
                  onChange={onInputChange}
                  placeholder="path/to/your/mcp_server.py, --port, 8080, --verbose"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Command-line arguments to pass to the executable. Separate multiple arguments with
                  commas or new lines.
                </p>
              </div>
            </>
          )}

          {connectionType === 'http' && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="url">Server URL</Label>
                <HelpTooltip>
                  <div className="space-y-2">
                    <p className="font-medium">Examples:</p>
                    <div className="text-xs space-y-1">
                      <p>
                        <strong>Local:</strong> http://localhost:8000/mcp
                      </p>
                      <p>
                        <strong>Custom port:</strong> http://127.0.0.1:3000/api/mcp
                      </p>
                      <p>
                        <strong>Remote:</strong> https://api.example.com/mcp
                      </p>
                    </div>
                  </div>
                </HelpTooltip>
              </div>
              <Input
                id="url"
                name="url"
                value={editingConfig.url || ''}
                onChange={onInputChange}
                placeholder="e.g., http://localhost:8000/mcp"
              />
              <p className="text-xs text-muted-foreground mt-1">
                HTTP endpoint for remote MCP servers. Use this instead of executable path for
                web-based servers.
              </p>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="enabled"
              name="enabled"
              checked={editingConfig.enabled}
              onCheckedChange={(checkedState) => onEnabledChange(!!checkedState)}
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="jsonConfig" className="mb-1 block">
            JSON Configuration
          </Label>
          <ScrollArea className="w-full h-72 rounded-md border p-2 whitespace-pre overflow-auto">
            <Textarea
              id="jsonConfig"
              name="jsonConfig"
              value={jsonString}
              onChange={onJsonInputChange}
              placeholder='{
  "name": "My JSON MCP Server",
  "command": "path/to/server",
  "args": ["--port", "8081"],
  "url": "http://localhost:8081/mcp",
  "enabled": true
}'
              rows={15}
              className="font-mono w-full h-full resize-none border-none focus:outline-none focus:ring-0"
            />
          </ScrollArea>
        </div>
      )}

      {testResult && (
        <div
          className={`rounded-md border p-3 ${
            testResult.success
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <p className="font-semibold">
            {testResult.success ? 'Connection successful' : 'Connection failed'}
            {testResult.serverName ? ` • ${testResult.serverName}` : ''}
            {testResult.serverVersion ? ` v${testResult.serverVersion}` : ''}
          </p>
          {testResult.error && <p className="text-sm mt-1">{testResult.error}</p>}
          {testResult.tools && testResult.tools.length > 0 && (
            <p className="text-sm mt-1 text-muted-foreground">
              Discovered tools ({testResult.tools.length}):{' '}
              {testResult.tools
                .slice(0, 5)
                .map((tool) => tool.name)
                .join(', ')}
              {testResult.tools.length > 5 ? '…' : ''}
            </p>
          )}
          {testResult.success && (!testResult.tools || testResult.tools.length === 0) && (
            <p className="text-sm mt-1 text-muted-foreground">
              Connected, but the server did not report any tools.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col space-y-2 sm:flex-row sm:flex-wrap sm:space-y-0 sm:space-x-2">
        <Button
          variant="secondary"
          onClick={onTest}
          disabled={isLoading || isTesting}
          className="w-full sm:w-auto"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button onClick={onSave} disabled={isLoading || isTesting} className="w-full sm:w-auto">
          {isLoading ? 'Saving...' : 'Save Configuration'}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading || isTesting}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
