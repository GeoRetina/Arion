import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, FolderOpen, Loader2, Monitor, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type {
  IntegrationHealthCheckResult,
  QgisDiscoveredInstallation,
  QgisIntegrationConfig
} from '../../../../../shared/ipc-types'

interface QgisConfigDialogProps {
  isOpen: boolean
  initialConfig?: QgisIntegrationConfig | null
  onClose: () => void
  onTest: (config: QgisIntegrationConfig) => Promise<IntegrationHealthCheckResult>
  onSaveAndConnect: (config: QgisIntegrationConfig) => Promise<IntegrationHealthCheckResult>
}

const DEFAULT_QGIS_CONFIG: QgisIntegrationConfig = {
  detectionMode: 'auto',
  timeoutMs: 30000,
  allowPluginAlgorithms: false
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const normalizeTimeout = (value: string): number | undefined => {
  if (value.trim().length === 0) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1000, Math.round(parsed)) : undefined
}

const toQgisConfig = (value?: QgisIntegrationConfig | null): QgisIntegrationConfig => ({
  ...DEFAULT_QGIS_CONFIG,
  ...(value || {})
})

const getResolvedConfig = (
  result: IntegrationHealthCheckResult | null
): QgisIntegrationConfig | null => {
  const details = asRecord(result?.details)
  const resolvedConfig = asRecord(details.resolvedConfig)
  const detectionMode = resolvedConfig.detectionMode === 'manual' ? 'manual' : 'auto'

  if (Object.keys(resolvedConfig).length === 0) {
    return null
  }

  return {
    detectionMode,
    launcherPath: readString(resolvedConfig.launcherPath),
    installRoot: readString(resolvedConfig.installRoot),
    version: readString(resolvedConfig.version),
    timeoutMs: readNumber(resolvedConfig.timeoutMs),
    allowPluginAlgorithms: readBoolean(resolvedConfig.allowPluginAlgorithms),
    lastVerifiedAt: readString(resolvedConfig.lastVerifiedAt)
  }
}

const toInstallation = (value: unknown): QgisDiscoveredInstallation | null => {
  const record = asRecord(value)
  const launcherPath = readString(record.launcherPath)
  const source = readString(record.source)
  const platform = readString(record.platform)

  if (!launcherPath || !source || !platform) {
    return null
  }

  return {
    launcherPath,
    installRoot: readString(record.installRoot),
    version: readString(record.version),
    source: source as QgisDiscoveredInstallation['source'],
    platform: platform as NodeJS.Platform,
    diagnostics: Array.isArray(record.diagnostics)
      ? record.diagnostics.filter((entry): entry is string => typeof entry === 'string')
      : []
  }
}

const getInstallations = (
  result: IntegrationHealthCheckResult | null
): QgisDiscoveredInstallation[] => {
  const details = asRecord(result?.details)
  if (!Array.isArray(details.installations)) {
    return []
  }

  return details.installations
    .map((entry) => toInstallation(entry))
    .filter((entry): entry is QgisDiscoveredInstallation => entry !== null)
}

const getPreferredInstallation = (
  result: IntegrationHealthCheckResult | null,
  config: QgisIntegrationConfig
): QgisDiscoveredInstallation | null => {
  const details = asRecord(result?.details)
  const preferredInstallation = toInstallation(details.preferredInstallation)
  if (preferredInstallation) {
    return preferredInstallation
  }

  if (!config.launcherPath) {
    return null
  }

  return {
    launcherPath: config.launcherPath,
    installRoot: config.installRoot,
    version: config.version,
    source: config.detectionMode === 'manual' ? 'manual' : 'path',
    platform: window.navigator.userAgent.includes('Windows') ? 'win32' : 'linux',
    diagnostics: []
  }
}

const getDiagnostics = (result: IntegrationHealthCheckResult | null): string[] => {
  const details = asRecord(result?.details)
  return Array.isArray(details.diagnostics)
    ? details.diagnostics.filter((entry): entry is string => typeof entry === 'string')
    : []
}

const formatTimestamp = (value?: string): string =>
  value ? new Date(value).toLocaleString() : 'Never'

export const QgisConfigDialog: React.FC<QgisConfigDialogProps> = ({
  isOpen,
  initialConfig,
  onClose,
  onTest,
  onSaveAndConnect
}) => {
  const [config, setConfig] = useState<QgisIntegrationConfig>(toQgisConfig(initialConfig))
  const [testResult, setTestResult] = useState<IntegrationHealthCheckResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setConfig(toQgisConfig(initialConfig))
    setTestResult(null)
  }, [initialConfig, isOpen])

  const resolvedConfig = useMemo(
    () => getResolvedConfig(testResult) || config,
    [config, testResult]
  )
  const preferredInstallation = useMemo(
    () => getPreferredInstallation(testResult, resolvedConfig),
    [resolvedConfig, testResult]
  )
  const installations = useMemo(() => getInstallations(testResult), [testResult])
  const diagnostics = useMemo(() => getDiagnostics(testResult), [testResult])

  const updateConfig = (updates: Partial<QgisIntegrationConfig>): void => {
    setConfig((previous) => ({
      ...previous,
      ...updates
    }))
    setTestResult(null)
  }

  const handleBrowseLauncher = async (): Promise<void> => {
    const launcherPath = await window.ctg.shell.selectFile({
      title: 'Select qgis_process launcher',
      buttonLabel: 'Use launcher'
    })

    if (!launcherPath) {
      return
    }

    updateConfig({
      detectionMode: 'manual',
      launcherPath
    })
  }

  const applyHealthResult = (result: IntegrationHealthCheckResult): void => {
    setTestResult(result)
    const canonicalConfig = getResolvedConfig(result)
    if (canonicalConfig) {
      setConfig((previous) => ({
        ...previous,
        ...canonicalConfig
      }))
    }
  }

  const handleTest = async (): Promise<void> => {
    setIsTesting(true)
    try {
      const result = await onTest(config)
      applyHealthResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to verify QGIS',
        checkedAt: new Date().toISOString()
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSaveAndConnect = async (): Promise<void> => {
    setIsSaving(true)
    try {
      const result = await onSaveAndConnect(config)
      applyHealthResult(result)
      if (result.success) {
        onClose()
      }
    } catch (error) {
      setTestResult({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save QGIS integration',
        checkedAt: new Date().toISOString()
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            QGIS Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Installation</CardTitle>
              <CardDescription>
                Auto-detect QGIS when possible, or provide a manual launcher path for a specific
                installation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={config.detectionMode === 'auto' ? 'default' : 'outline'}
                  onClick={() =>
                    updateConfig({
                      detectionMode: 'auto',
                      launcherPath: undefined
                    })
                  }
                >
                  <Search className="mr-2 h-4 w-4" />
                  Auto Detect
                </Button>
                <Button
                  type="button"
                  variant={config.detectionMode === 'manual' ? 'default' : 'outline'}
                  onClick={() => updateConfig({ detectionMode: 'manual' })}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Manual Path
                </Button>
              </div>

              {config.detectionMode === 'manual' && (
                <div className="space-y-2">
                  <Label htmlFor="qgis-launcher-path">Launcher Path</Label>
                  <div className="flex gap-2">
                    <Input
                      id="qgis-launcher-path"
                      value={config.launcherPath || ''}
                      onChange={(event) =>
                        updateConfig({
                          launcherPath: event.target.value
                        })
                      }
                      placeholder="C:\\Program Files\\QGIS\\bin\\qgis_process-qgis.bat"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleBrowseLauncher()}
                    >
                      Browse
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="qgis-timeout">Default Timeout (ms)</Label>
                  <Input
                    id="qgis-timeout"
                    type="number"
                    inputMode="numeric"
                    value={typeof config.timeoutMs === 'number' ? String(config.timeoutMs) : ''}
                    onChange={(event) =>
                      updateConfig({
                        timeoutMs: normalizeTimeout(event.target.value)
                      })
                    }
                    placeholder="30000"
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="qgis-plugins">Allow Plugin Algorithms</Label>
                    <p className="text-xs text-muted-foreground">
                      Off by default so only vetted core providers are available.
                    </p>
                  </div>
                  <Switch
                    id="qgis-plugins"
                    checked={config.allowPluginAlgorithms === true}
                    onCheckedChange={(checked) =>
                      updateConfig({
                        allowPluginAlgorithms: checked === true
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Verification</CardTitle>
              <CardDescription>
                Verify the selected QGIS installation before saving it for connector execution.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={handleTest} disabled={isTesting}>
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Installation'
                  )}
                </Button>
                <div className="text-xs text-muted-foreground self-center">
                  Last verified: {formatTimestamp(resolvedConfig.lastVerifiedAt)}
                </div>
              </div>

              {testResult && (
                <div
                  className={`rounded-md border p-4 ${
                    testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span
                      className={`font-medium ${
                        testResult.success ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {testResult.success ? 'QGIS is ready' : 'QGIS verification failed'}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-sm ${
                      testResult.success ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {testResult.message}
                  </p>
                </div>
              )}

              {preferredInstallation && (
                <div className="rounded-md border border-border/60 p-3 text-sm">
                  <div className="font-medium">Selected installation</div>
                  <div className="mt-2 text-muted-foreground">
                    Version: {preferredInstallation.version || 'Unknown'}
                  </div>
                  <div className="text-muted-foreground">
                    Source: {preferredInstallation.source}
                  </div>
                  <div className="break-all text-muted-foreground">
                    Launcher: {preferredInstallation.launcherPath}
                  </div>
                  {preferredInstallation.installRoot && (
                    <div className="break-all text-muted-foreground">
                      Install root: {preferredInstallation.installRoot}
                    </div>
                  )}
                </div>
              )}

              {installations.length > 1 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Detected installations</div>
                  <div className="space-y-2">
                    {installations.map((installation) => (
                      <div
                        key={`${installation.source}:${installation.launcherPath}`}
                        className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground"
                      >
                        <div className="font-medium text-foreground">
                          {installation.version || 'Unknown version'}
                        </div>
                        <div>Source: {installation.source}</div>
                        <div className="break-all">{installation.launcherPath}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diagnostics.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Diagnostics</div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {diagnostics.map((entry, index) => (
                      <li key={`${entry}-${index}`}>{entry}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSaveAndConnect} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save and Connect'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default QgisConfigDialog
