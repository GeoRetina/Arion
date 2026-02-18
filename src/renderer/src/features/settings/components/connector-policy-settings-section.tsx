import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConnectorPolicyConfig } from '../hooks/use-connector-policy-config'

const ConnectorPolicySettingsSection: React.FC = () => {
  const {
    connectorPolicyConfig,
    connectorPolicyBackendsInput,
    connectorPolicyDenylistInput,
    connectorSensitiveCapabilitiesInput,
    connectorBlockedMcpToolNamesInput,
    isConnectorPolicyLoading,
    isSavingConnectorPolicy,
    setConnectorPolicyBackendsInput,
    setConnectorPolicyDenylistInput,
    setConnectorSensitiveCapabilitiesInput,
    setConnectorBlockedMcpToolNamesInput,
    updateConnectorPolicyConfig,
    saveConnectorPolicyConfig
  } = useConnectorPolicyConfig()

  const toNumberOrFallback = (value: string, fallback: number): number => {
    if (value.trim().length === 0) {
      return fallback
    }
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  return (
    <>
      <h2 className="text-xl font-medium mb-5">Connector Policy</h2>
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle>Connector Execution Policy</CardTitle>
          <CardDescription>
            Configure backend restrictions, timeout/retry defaults, and approval behavior for
            connector capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-3 space-y-4">
          {isConnectorPolicyLoading ? (
            <div className="text-sm text-muted-foreground">Loading connector policy...</div>
          ) : !connectorPolicyConfig ? (
            <div className="text-sm text-muted-foreground">
              Failed to load connector policy configuration.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={connectorPolicyConfig.enabled}
                    onChange={(event) =>
                      updateConnectorPolicyConfig((config) => ({
                        ...config,
                        enabled: event.target.checked
                      }))
                    }
                  />
                  <span>Enable connector policy enforcement</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={connectorPolicyConfig.strictMode}
                    onChange={(event) =>
                      updateConnectorPolicyConfig((config) => ({
                        ...config,
                        strictMode: event.target.checked
                      }))
                    }
                  />
                  <span>Strict mode (native-only by default)</span>
                </label>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Default Approval Mode</h3>
                  <select
                    value={connectorPolicyConfig.defaultApprovalMode}
                    onChange={(event) =>
                      updateConnectorPolicyConfig((config) => ({
                        ...config,
                        defaultApprovalMode: event.target.value as 'once' | 'session' | 'always'
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="always">always</option>
                    <option value="session">session</option>
                    <option value="once">once</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Default Timeout (ms)</h3>
                  <Input
                    type="number"
                    value={connectorPolicyConfig.defaultTimeoutMs}
                    onChange={(event) =>
                      updateConnectorPolicyConfig((config) => ({
                        ...config,
                        defaultTimeoutMs: toNumberOrFallback(
                          event.target.value,
                          config.defaultTimeoutMs
                        )
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Default Max Retries</h3>
                  <Input
                    type="number"
                    value={connectorPolicyConfig.defaultMaxRetries}
                    onChange={(event) =>
                      updateConnectorPolicyConfig((config) => ({
                        ...config,
                        defaultMaxRetries: toNumberOrFallback(
                          event.target.value,
                          config.defaultMaxRetries
                        )
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Default Allowed Backends</h3>
                <Input
                  value={connectorPolicyBackendsInput}
                  onChange={(event) => setConnectorPolicyBackendsInput(event.target.value)}
                  placeholder="native, mcp, plugin"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Backend Denylist</h3>
                <Input
                  value={connectorPolicyDenylistInput}
                  onChange={(event) => setConnectorPolicyDenylistInput(event.target.value)}
                  placeholder="plugin"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Sensitive Capabilities</h3>
                <Textarea
                  value={connectorSensitiveCapabilitiesInput}
                  onChange={(event) => setConnectorSensitiveCapabilitiesInput(event.target.value)}
                  className="min-h-24 resize-y"
                  placeholder="sql.query, storage.list, gee.listAlgorithms"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Blocked Raw MCP Tool Names</h3>
                <Textarea
                  value={connectorBlockedMcpToolNamesInput}
                  onChange={(event) => setConnectorBlockedMcpToolNamesInput(event.target.value)}
                  className="min-h-24 resize-y"
                  placeholder="connect_database, execute_select_query"
                />
                <p className="text-xs text-muted-foreground">
                  Raw MCP tools in this list are hidden from the LLM tool registry. This does not
                  affect canonical connector tools.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={saveConnectorPolicyConfig} disabled={isSavingConnectorPolicy}>
                  {isSavingConnectorPolicy ? 'Saving...' : 'Save Connector Policy'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export { ConnectorPolicySettingsSection }
