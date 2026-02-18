import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type {
  PluginDiagnosticsSnapshot,
  PluginInventoryItem,
  PluginPlatformConfig
} from '@/../../shared/ipc-types'
import { toast } from 'sonner'

const DEFAULT_PLUGIN_CONFIG: PluginPlatformConfig = {
  enabled: true,
  workspaceRoot: null,
  configuredPluginPaths: [],
  enableBundledPlugins: false,
  allowlist: [],
  denylist: [],
  enabledPluginIds: [],
  disabledPluginIds: [],
  exclusiveSlotAssignments: {},
  pluginConfigById: {}
}

const parseStringList = (raw: string): string[] => {
  const unique = new Set<string>()
  for (const segment of raw.split(/[,\n]/g)) {
    const normalized = segment.trim()
    if (normalized.length > 0) {
      unique.add(normalized)
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const formatStringList = (values: string[]): string => values.join(', ')

const statusVariant = (
  status: PluginInventoryItem['status']
): 'default' | 'secondary' | 'outline' | 'destructive' => {
  if (status === 'active') {
    return 'default'
  }
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'ignored') {
    return 'secondary'
  }
  return 'outline'
}

export function PluginsPage(): ReactElement {
  const [config, setConfig] = useState<PluginPlatformConfig>(DEFAULT_PLUGIN_CONFIG)
  const [snapshot, setSnapshot] = useState<PluginDiagnosticsSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isReloading, setIsReloading] = useState(false)

  const inventory = snapshot?.inventory || []
  const hooks = snapshot?.hooks || []
  const tools = snapshot?.tools || []

  const sortedDiagnostics = useMemo(
    () =>
      [...(snapshot?.diagnostics || [])].sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return b.timestamp.localeCompare(a.timestamp)
        }
        return a.code.localeCompare(b.code)
      }),
    [snapshot?.diagnostics]
  )

  const loadState = async (): Promise<void> => {
    setIsLoading(true)
    try {
      const [loadedConfig, loadedSnapshot] = await Promise.all([
        window.ctg.settings.getPluginPlatformConfig(),
        window.ctg.settings.getPluginDiagnostics()
      ])
      setConfig(loadedConfig)
      setSnapshot(loadedSnapshot)
    } catch (error) {
      toast.error('Failed to load plugin runtime state', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadState()
  }, [])

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await window.ctg.settings.setPluginPlatformConfig(config)
      const refreshed = await window.ctg.settings.reloadPluginRuntime()
      setSnapshot(refreshed)
      setConfig(refreshed.config)
      toast.success('Plugin policy saved and runtime reloaded')
    } catch (error) {
      toast.error('Failed to save plugin policy', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReload = async (): Promise<void> => {
    setIsReloading(true)
    try {
      const refreshed = await window.ctg.settings.reloadPluginRuntime()
      setSnapshot(refreshed)
      toast.success('Plugin runtime reloaded')
    } catch (error) {
      toast.error('Failed to reload plugin runtime', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsReloading(false)
    }
  }

  const handlePluginToggle = (pluginId: string, nextEnabled: boolean): void => {
    setConfig((previous) => {
      const enabledSet = new Set(previous.enabledPluginIds)
      const disabledSet = new Set(previous.disabledPluginIds)

      if (nextEnabled) {
        enabledSet.add(pluginId)
        disabledSet.delete(pluginId)
      } else {
        disabledSet.add(pluginId)
        enabledSet.delete(pluginId)
      }

      return {
        ...previous,
        enabledPluginIds: Array.from(enabledSet.values()).sort((a, b) => a.localeCompare(b)),
        disabledPluginIds: Array.from(disabledSet.values()).sort((a, b) => a.localeCompare(b))
      }
    })
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading plugin platform state...</div>
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle>Plugin Policy</CardTitle>
          <CardDescription>
            Configure discovery roots, trust policy, and runtime toggles.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-3 space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              <span>Enable plugin runtime</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.enableBundledPlugins}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, enableBundledPlugins: event.target.checked }))
                }
              />
              <span>Enable bundled plugins</span>
            </label>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Workspace Root (optional)</h3>
            <Input
              value={config.workspaceRoot || ''}
              placeholder="/path/to/workspace"
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  workspaceRoot: event.target.value.trim().length > 0 ? event.target.value : null
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Configured Plugin Paths</h3>
            <Textarea
              value={config.configuredPluginPaths.join('\n')}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  configuredPluginPaths: parseStringList(event.target.value)
                }))
              }
              placeholder={'/path/to/plugin-a\n/path/to/plugin-root'}
              className="min-h-[96px] resize-y"
            />
            <p className="text-xs text-muted-foreground">
              One path per line. Supports direct plugin folders or manifest files.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Allowlist (optional)</h3>
              <Input
                value={formatStringList(config.allowlist)}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    allowlist: parseStringList(event.target.value)
                  }))
                }
                placeholder="plugin-a, plugin-b"
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Denylist</h3>
              <Input
                value={formatStringList(config.denylist)}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    denylist: parseStringList(event.target.value)
                  }))
                }
                placeholder="plugin-risky"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save and Reload'}
            </Button>
            <Button variant="outline" onClick={handleReload} disabled={isReloading}>
              {isReloading ? 'Reloading...' : 'Reload Runtime'}
            </Button>
            <Button variant="outline" onClick={loadState}>
              Refresh Snapshot
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle>Plugin Inventory</CardTitle>
          <CardDescription>
            Active plugins can register tools and hooks. Disabled or ignored entries include
            reasons.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-3 space-y-3">
          {inventory.length === 0 ? (
            <div className="text-sm text-muted-foreground">No plugins discovered.</div>
          ) : (
            inventory.map((item) => {
              const isForcedDisabled = config.disabledPluginIds.includes(item.id)
              const isForcedEnabled = config.enabledPluginIds.includes(item.id)
              return (
                <div key={`${item.id}:${item.sourcePath}`} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm">{item.name}</div>
                      <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                      <Badge variant="outline">{item.source}</Badge>
                      {item.hasConfigSchema ? <Badge variant="outline">schema</Badge> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePluginToggle(item.id, true)}
                        disabled={isForcedEnabled}
                      >
                        Enable
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePluginToggle(item.id, false)}
                        disabled={isForcedDisabled}
                      >
                        Disable
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.id} v{item.version}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 break-all">
                    {item.sourcePath}
                  </div>
                  {item.reason ? <div className="text-xs mt-1">{item.reason}</div> : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle>Runtime Inventory</CardTitle>
          <CardDescription>
            {hooks.length} hooks and {tools.length} tools currently registered by active plugins.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-3 grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Hooks</h3>
            {hooks.length === 0 ? (
              <div className="text-sm text-muted-foreground">No hooks registered.</div>
            ) : (
              <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                {hooks.map((hook) => (
                  <div
                    key={`${hook.pluginId}:${hook.event}:${hook.mode}:${hook.priority}`}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <span className="font-medium">{hook.event}</span>{' '}
                    <span className="text-muted-foreground">[{hook.mode}]</span>{' '}
                    <span className="text-muted-foreground">prio {hook.priority}</span>{' '}
                    <span className="text-muted-foreground">({hook.pluginId})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tools</h3>
            {tools.length === 0 ? (
              <div className="text-sm text-muted-foreground">No plugin tools registered.</div>
            ) : (
              <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                {tools.map((tool) => (
                  <div
                    key={`${tool.pluginId}:${tool.name}`}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <span className="font-medium">{tool.name}</span>{' '}
                    <span className="text-muted-foreground">({tool.pluginId})</span>{' '}
                    <span className="text-muted-foreground">[{tool.category}]</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>Latest plugin platform warnings, errors, and logs.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-3 space-y-2">
          {sortedDiagnostics.length === 0 ? (
            <div className="text-sm text-muted-foreground">No diagnostics.</div>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
              {sortedDiagnostics.map((entry) => (
                <div
                  key={`${entry.timestamp}:${entry.code}:${entry.pluginId || 'global'}`}
                  className="rounded border px-2 py-1 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        entry.level === 'error'
                          ? 'destructive'
                          : entry.level === 'warning'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {entry.level}
                    </Badge>
                    <span className="font-medium">{entry.code}</span>
                    <span className="text-muted-foreground">{entry.timestamp}</span>
                  </div>
                  <div className="mt-1">{entry.message}</div>
                  {entry.pluginId ? (
                    <div className="text-muted-foreground mt-1">plugin: {entry.pluginId}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
