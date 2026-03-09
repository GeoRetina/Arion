import { useEffect, useState } from 'react'
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
import { useCodexStore } from '@/stores/codex-store'
import { PROVIDER_LOGOS, PROVIDER_LOGO_CLASSES } from '@/constants/llm-providers'
import type { CodexConfig, CodexHealthStatus } from '../../../../../shared/ipc-types'

const defaultDraftConfig: CodexConfig = {
  binaryPath: null,
  homePath: null,
  defaultModel: 'gpt-5.3-codex',
  reasoningEffort: 'medium',
  defaultMode: 'workspace-approval'
}

function normalizeOptionalPath(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getStatusPresentation(health: CodexHealthStatus | null): {
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

export default function AgentIntegrationsTab(): React.JSX.Element {
  const initialize = useCodexStore((state) => state.initialize)
  const saveConfig = useCodexStore((state) => state.saveConfig)
  const refreshHealth = useCodexStore((state) => state.refreshHealth)
  const config = useCodexStore((state) => state.config)
  const health = useCodexStore((state) => state.health)
  const error = useCodexStore((state) => state.error)
  const clearError = useCodexStore((state) => state.clearError)
  const isLoadingConfig = useCodexStore((state) => state.isLoadingConfig)
  const isLoadingHealth = useCodexStore((state) => state.isLoadingHealth)

  const [draft, setDraft] = useState<CodexConfig>(defaultDraftConfig)
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (config) {
      setDraft(config)
    }
  }, [config])

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error('Codex integration error', {
      description: error
    })
    clearError()
  }, [error, clearError])

  const statusPresentation = getStatusPresentation(health)

  const handleSave = async (): Promise<void> => {
    try {
      await saveConfig({
        binaryPath: normalizeOptionalPath(draft.binaryPath || ''),
        homePath: normalizeOptionalPath(draft.homePath || ''),
        defaultModel: draft.defaultModel.trim() || defaultDraftConfig.defaultModel,
        reasoningEffort: draft.reasoningEffort,
        defaultMode: 'workspace-approval'
      })
      toast.success('Codex integration updated')
      setIsConfigOpen(false)
    } catch {
      // Store error state drives the toast.
    }
  }

  const handleRefresh = async (): Promise<void> => {
    const refreshed = await refreshHealth()
    if (refreshed?.isReady) {
      toast.success('Codex is ready')
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <ExternalAgentIntegrationCard
          title="Codex"
          description="Local Codex CLI runtime"
          summary={
            health?.isReady
              ? `Model: ${draft.defaultModel} · Effort: ${draft.reasoningEffort}`
              : 'Managed runtime for custom analysis, scripts, and reproducible geospatial workspaces.'
          }
          iconSrc={PROVIDER_LOGOS.openai}
          iconClassName={PROVIDER_LOGO_CLASSES.openai}
          statusLabel={statusPresentation.label}
          statusClassName={statusPresentation.className}
          onConfigure={() => setIsConfigOpen(true)}
          action={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void handleRefresh()}
              disabled={isLoadingHealth}
            >
              {isLoadingHealth ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          }
        />
      </div>

      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-125">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center p-1">
                <img
                  src={PROVIDER_LOGOS.openai}
                  alt="Codex logo"
                  className={`h-full w-full object-contain ${PROVIDER_LOGO_CLASSES.openai}`}
                />
              </div>
              <DialogTitle className="text-xl">Configure Codex</DialogTitle>
            </div>
            <DialogDescription>
              Configure the local Codex CLI for analysis, scripts, and geospatial workspaces.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="codex-binary-path" className="font-medium">
                  Codex binary path
                </Label>
                <Input
                  id="codex-binary-path"
                  placeholder="codex"
                  value={draft.binaryPath || ''}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      binaryPath: event.target.value || null
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use `codex` from your system PATH.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="codex-home-path" className="font-medium">
                  CODEX_HOME override
                </Label>
                <Input
                  id="codex-home-path"
                  placeholder="Optional custom Codex home directory"
                  value={draft.homePath || ''}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, homePath: event.target.value || null }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Use this only if you keep Codex state in a non-default location.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="codex-default-model" className="font-medium">
                  Default model
                </Label>
                <Input
                  id="codex-default-model"
                  value={draft.defaultModel}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, defaultModel: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label className="font-medium">Reasoning effort</Label>
                <Select
                  value={draft.reasoningEffort}
                  onValueChange={(value: CodexConfig['reasoningEffort']) =>
                    setDraft((current) => ({ ...current, reasoningEffort: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                Health
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  <span className="font-medium">Install:</span>{' '}
                  {health?.install.message || 'Checking Codex CLI...'}
                </p>
                <p>
                  <span className="font-medium">Authentication:</span>{' '}
                  {health?.authMessage || 'Checking login status...'}
                </p>
                <p>
                  <span className="font-medium">Execution mode:</span> Workspace approval only
                </p>
                <p className="text-muted-foreground">
                  If authentication is missing, run{' '}
                  <code className="rounded bg-background px-1.5 py-0.5">codex login</code> in a
                  terminal, then refresh.
                </p>
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
              disabled={isLoadingConfig}
            >
              {isLoadingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
