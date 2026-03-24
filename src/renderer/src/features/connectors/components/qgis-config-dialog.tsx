import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FolderOpen, Monitor, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type {
  IntegrationHealthCheckResult,
  QgisDiscoveredInstallation,
  QgisIntegrationConfig
} from '../../../../../shared/ipc-types'
import { IntegrationDialogFooter, IntegrationStatusBanner } from './integration-dialog-shared'
import { buildIntegrationErrorResult, runIntegrationHealthAction } from './integration-dialog-utils'

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

const formatTimestamp = (value?: string): string | null => {
  if (!value) return null
  try {
    return new Date(value).toLocaleString()
  } catch {
    return null
  }
}

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
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setConfig(toQgisConfig(initialConfig))
    setTestResult(null)
    setShowDetails(false)
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
  const isAlreadyVerified = !testResult && !!config.lastVerifiedAt
  const verifiedAtLabel = isAlreadyVerified ? formatTimestamp(config.lastVerifiedAt) : null
  const showStatus = testResult !== null || isAlreadyVerified
  const statusSuccess = testResult ? testResult.success : true
  const statusMessage = testResult?.message ?? null
  const hasDetails =
    preferredInstallation !== null || installations.length > 1 || diagnostics.length > 0

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
    await runIntegrationHealthAction({
      action: () => onTest(config),
      setPending: setIsTesting,
      onResult: applyHealthResult,
      onError: (error) => setTestResult(buildIntegrationErrorResult(error, 'Failed to verify QGIS'))
    })
  }

  const handleSaveAndConnect = async (): Promise<void> => {
    await runIntegrationHealthAction({
      action: () => onSaveAndConnect(config),
      setPending: setIsSaving,
      onResult: applyHealthResult,
      onSuccess: () => onClose(),
      onError: (error) =>
        setTestResult(buildIntegrationErrorResult(error, 'Failed to save QGIS integration'))
    })
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            QGIS Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Detection mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Installation</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={config.detectionMode === 'auto' ? 'default' : 'outline'}
                onClick={() =>
                  updateConfig({
                    detectionMode: 'auto',
                    launcherPath: undefined
                  })
                }
              >
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Auto Detect
              </Button>
              <Button
                type="button"
                size="sm"
                variant={config.detectionMode === 'manual' ? 'default' : 'outline'}
                onClick={() => updateConfig({ detectionMode: 'manual' })}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Manual
              </Button>
            </div>

            {config.detectionMode === 'manual' && (
              <div className="flex gap-2">
                <Input
                  id="qgis-launcher-path"
                  value={config.launcherPath || ''}
                  onChange={(event) =>
                    updateConfig({
                      launcherPath: event.target.value
                    })
                  }
                  placeholder="Path to qgis_process executable"
                  className="text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleBrowseLauncher()}
                >
                  Browse
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-border/40" />

          {/* Settings */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Settings</Label>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="qgis-timeout" className="text-xs text-muted-foreground">
                  Default timeout (ms)
                </Label>
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
                  className="text-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="qgis-plugins" className="text-sm">
                    Allow plugin algorithms
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Only vetted core providers are available by default.
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
          </div>

          {/* Status — from a fresh test result, or from a previously verified config */}
          {showStatus && (
            <>
              <div className="border-t border-border/40" />

              <IntegrationStatusBanner
                success={statusSuccess}
                title={
                  statusSuccess
                    ? isAlreadyVerified
                      ? 'Connected'
                      : 'QGIS is ready'
                    : 'Verification failed'
                }
                message={statusMessage}
                secondaryMessage={
                  isAlreadyVerified && verifiedAtLabel ? `Verified: ${verifiedAtLabel}` : null
                }
              />

              {/* Collapsible details */}
              {hasDetails && (
                <div className="rounded-md border border-border/60">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowDetails((prev) => !prev)}
                  >
                    Details
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showDetails && (
                    <div className="border-t border-border/40 px-3 py-2.5 space-y-3 text-xs text-muted-foreground">
                      {preferredInstallation && (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Selected installation</div>
                          <div>Version: {preferredInstallation.version || 'Unknown'}</div>
                          <div>Source: {preferredInstallation.source}</div>
                          <div className="break-all">
                            Launcher: {preferredInstallation.launcherPath}
                          </div>
                          {preferredInstallation.installRoot && (
                            <div className="break-all">
                              Install root: {preferredInstallation.installRoot}
                            </div>
                          )}
                        </div>
                      )}

                      {installations.length > 1 && (
                        <div className="space-y-1.5">
                          <div className="font-medium text-foreground">Other installations</div>
                          {installations.map((installation) => (
                            <div
                              key={`${installation.source}:${installation.launcherPath}`}
                              className="rounded border border-border/40 px-2 py-1.5"
                            >
                              <div className="font-medium text-foreground">
                                {installation.version || 'Unknown version'}
                              </div>
                              <div>Source: {installation.source}</div>
                              <div className="break-all">{installation.launcherPath}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {diagnostics.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Diagnostics</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {diagnostics.map((entry, index) => (
                              <li key={`${entry}-${index}`}>{entry}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <IntegrationDialogFooter
          isSaving={isSaving}
          isTesting={isTesting}
          onCancel={onClose}
          onSave={handleSaveAndConnect}
          onTest={handleTest}
          testLabel="Verify"
          testingLabel="Verifying..."
        />
      </DialogContent>
    </Dialog>
  )
}

export default QgisConfigDialog
