import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import ExternalAgentIntegrationCard from './external-agent-integration-card'
import { useExternalRuntimeStore } from '@/stores/external-runtime-store'
import { PROVIDER_LOGOS, PROVIDER_LOGO_CLASSES } from '@/constants/llm-providers'
import type {
  ExternalRuntimeConfig,
  ExternalRuntimeDescriptor,
  ExternalRuntimeHealthStatus
} from '../../../../../shared/ipc-types'

function buildDraftConfig(
  descriptor: ExternalRuntimeDescriptor,
  config: ExternalRuntimeConfig | undefined
): ExternalRuntimeConfig {
  return {
    ...descriptor.defaultConfig,
    ...(config || {})
  }
}

function getStatusPresentation(health: ExternalRuntimeHealthStatus | null | undefined): {
  label: string
  className: string
} {
  if (!health) {
    return {
      label: 'Checking',
      className: 'border-amber-500/40 text-amber-700 dark:text-amber-300'
    }
  }

  if (health.isReady) {
    return {
      label: 'Ready',
      className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
    }
  }

  if (health.install.state === 'missing') {
    return {
      label: 'Missing',
      className: 'border-destructive/40 text-destructive'
    }
  }

  if (health.install.state === 'unsupported-version') {
    return {
      label: 'Upgrade Needed',
      className: 'border-amber-500/40 text-amber-700 dark:text-amber-300'
    }
  }

  if (health.authState === 'unauthenticated') {
    return {
      label: 'Login Required',
      className: 'border-amber-500/40 text-amber-700 dark:text-amber-300'
    }
  }

  return {
    label: 'Unavailable',
    className: 'border-destructive/40 text-destructive'
  }
}

function getRuntimeSummary(
  descriptor: ExternalRuntimeDescriptor,
  config: ExternalRuntimeConfig | undefined,
  health: ExternalRuntimeHealthStatus | null | undefined
): string {
  if (!health?.isReady) {
    return descriptor.description
  }

  const mergedConfig = buildDraftConfig(descriptor, config)
  const summaryParts = descriptor.configFields
    .filter((field) => field.showInSummary)
    .map((field) => {
      const value = mergedConfig[field.key]
      return typeof value === 'string' && value.trim().length > 0
        ? `${field.label}: ${value.trim()}`
        : null
    })
    .filter((value): value is string => Boolean(value))

  return summaryParts.length > 0 ? summaryParts.join(' | ') : descriptor.description
}

export default function AgentIntegrationsTab(): React.JSX.Element {
  const initialize = useExternalRuntimeStore((state) => state.initialize)
  const saveConfig = useExternalRuntimeStore((state) => state.saveConfig)
  const refreshHealth = useExternalRuntimeStore((state) => state.refreshHealth)
  const descriptors = useExternalRuntimeStore((state) => state.descriptors)
  const configs = useExternalRuntimeStore((state) => state.configs)
  const healthByRuntime = useExternalRuntimeStore((state) => state.healthByRuntime)
  const loadingConfigByRuntime = useExternalRuntimeStore((state) => state.loadingConfigByRuntime)
  const loadingHealthByRuntime = useExternalRuntimeStore((state) => state.loadingHealthByRuntime)
  const error = useExternalRuntimeStore((state) => state.error)
  const clearError = useExternalRuntimeStore((state) => state.clearError)

  const [draftByRuntime, setDraftByRuntime] = useState<Record<string, ExternalRuntimeConfig>>({})
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    setDraftByRuntime((current) => {
      const next = { ...current }
      descriptors.forEach((descriptor) => {
        next[descriptor.id] = buildDraftConfig(descriptor, configs[descriptor.id])
      })
      return next
    })
  }, [configs, descriptors])

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error('External runtime error', {
      description: error
    })
    clearError()
  }, [error, clearError])

  const selectedDescriptor = useMemo(
    () => descriptors.find((descriptor) => descriptor.id === selectedRuntimeId) || null,
    [descriptors, selectedRuntimeId]
  )

  const selectedDraft =
    (selectedRuntimeId ? draftByRuntime[selectedRuntimeId] : undefined) ||
    (selectedDescriptor
      ? buildDraftConfig(selectedDescriptor, configs[selectedDescriptor.id])
      : undefined)

  const selectedHealth = selectedRuntimeId ? healthByRuntime[selectedRuntimeId] : null

  const handleSave = async (): Promise<void> => {
    if (!selectedRuntimeId || !selectedDraft) {
      return
    }

    try {
      await saveConfig(selectedRuntimeId, selectedDraft)
      toast.success('Integration updated')
      setSelectedRuntimeId(null)
    } catch {
      // Store error state drives the toast.
    }
  }

  const handleRefresh = async (runtimeId: string): Promise<void> => {
    const refreshed = await refreshHealth(runtimeId)
    if (refreshed?.isReady) {
      toast.success(`${refreshed.runtimeName} is ready`)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {descriptors.map((descriptor) => {
          const health = healthByRuntime[descriptor.id]
          const statusPresentation = getStatusPresentation(health)

          return (
            <ExternalAgentIntegrationCard
              key={descriptor.id}
              title={descriptor.name}
              description={descriptor.description}
              summary={getRuntimeSummary(descriptor, configs[descriptor.id], health)}
              iconSrc={PROVIDER_LOGOS[descriptor.providerHint]}
              iconClassName={PROVIDER_LOGO_CLASSES[descriptor.providerHint]}
              statusLabel={statusPresentation.label}
              statusClassName={statusPresentation.className}
              onConfigure={() => setSelectedRuntimeId(descriptor.id)}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => void handleRefresh(descriptor.id)}
                  disabled={loadingHealthByRuntime[descriptor.id]}
                >
                  {loadingHealthByRuntime[descriptor.id] ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              }
            />
          )
        })}
      </div>

      <Dialog
        open={Boolean(selectedDescriptor)}
        onOpenChange={(open) => !open && setSelectedRuntimeId(null)}
      >
        <DialogContent className="sm:max-w-125">
          {selectedDescriptor && selectedDraft ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center p-1">
                    <img
                      src={PROVIDER_LOGOS[selectedDescriptor.providerHint]}
                      alt={`${selectedDescriptor.name} logo`}
                      className={`h-full w-full object-contain ${PROVIDER_LOGO_CLASSES[selectedDescriptor.providerHint]}`}
                    />
                  </div>
                  <DialogTitle className="text-xl">Configure {selectedDescriptor.name}</DialogTitle>
                </div>
                <DialogDescription>{selectedDescriptor.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="space-y-4">
                  {selectedDescriptor.configFields.map((field) => {
                    const value = selectedDraft[field.key]
                    const stringValue = typeof value === 'string' ? value : ''

                    return (
                      <div key={field.key} className="grid gap-2">
                        <Label
                          htmlFor={`${selectedDescriptor.id}-${field.key}`}
                          className="font-medium"
                        >
                          {field.label}
                        </Label>
                        {field.type === 'select' ? (
                          <Select
                            value={stringValue}
                            onValueChange={(nextValue) =>
                              setDraftByRuntime((current) => ({
                                ...current,
                                [selectedDescriptor.id]: {
                                  ...(current[selectedDescriptor.id] ||
                                    buildDraftConfig(
                                      selectedDescriptor,
                                      configs[selectedDescriptor.id]
                                    )),
                                  [field.key]: nextValue
                                }
                              }))
                            }
                            disabled={field.readOnly}
                          >
                            <SelectTrigger id={`${selectedDescriptor.id}-${field.key}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options || []).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`${selectedDescriptor.id}-${field.key}`}
                            placeholder={field.placeholder}
                            value={stringValue}
                            onChange={(event) =>
                              setDraftByRuntime((current) => ({
                                ...current,
                                [selectedDescriptor.id]: {
                                  ...(current[selectedDescriptor.id] ||
                                    buildDraftConfig(
                                      selectedDescriptor,
                                      configs[selectedDescriptor.id]
                                    )),
                                  [field.key]: event.target.value || null
                                }
                              }))
                            }
                            disabled={field.readOnly}
                          />
                        )}
                        {field.description ? (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                    Health
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Install:</span>{' '}
                      {selectedHealth?.install.message || 'Checking runtime installation...'}
                    </p>
                    <p>
                      <span className="font-medium">Authentication:</span>{' '}
                      {selectedHealth?.authMessage || 'Checking login status...'}
                    </p>
                    {(selectedDescriptor.setupNotes || []).map((note) => (
                      <p key={note} className="text-muted-foreground">
                        {note}
                      </p>
                    ))}
                    {selectedDescriptor.loginCommand ? (
                      <p className="text-muted-foreground">
                        If authentication is missing, run{' '}
                        <code className="rounded bg-background px-1.5 py-0.5">
                          {selectedDescriptor.loginCommand}
                        </code>{' '}
                        in a terminal, then refresh.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex gap-2 justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  className="px-6 gap-2"
                  onClick={() => void handleSave()}
                  disabled={Boolean(selectedRuntimeId && loadingConfigByRuntime[selectedRuntimeId])}
                >
                  {selectedRuntimeId && loadingConfigByRuntime[selectedRuntimeId] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save Configuration
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
