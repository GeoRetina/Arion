import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  Loader2,
  Package,
  PlayCircle,
  ShieldAlert,
  TerminalSquare,
  XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useExternalRuntimeStore } from '@/stores/external-runtime-store'
import { PROVIDER_LOGOS, PROVIDER_LOGO_CLASSES } from '@/constants/llm-providers'
import type { LLMProvider } from '@/stores/llm-store'
import type {
  ExternalRuntimeDescriptor,
  ExternalRuntimeRunArtifact,
  ExternalRuntimeRunRecord,
  ExternalRuntimeRunResult,
  ExternalRuntimeRunStatus,
  ExternalRuntimeEvent,
  ExternalRuntimeStagedInput
} from '../../../../../shared/ipc-types'

type ExternalRuntimeDisplayRun = Partial<ExternalRuntimeRunRecord> &
  Partial<ExternalRuntimeRunResult> & {
    runtimeId: string
    runtimeName: string
    runId: string
    status: ExternalRuntimeRunStatus
    artifacts: ExternalRuntimeRunArtifact[]
    stagedInputs: ExternalRuntimeStagedInput[]
  }

function getRuntimeProvider(
  runtimeId: string,
  descriptors: ExternalRuntimeDescriptor[]
): NonNullable<LLMProvider> | null {
  const descriptor = descriptors.find((entry) => entry.id === runtimeId)
  return descriptor?.providerHint ?? null
}

function RuntimeIcon({
  provider,
  runtimeName,
  className
}: {
  provider: NonNullable<LLMProvider> | null
  runtimeName: string
  className?: string
}): React.JSX.Element {
  if (!provider) {
    return (
      <div
        aria-label={`${runtimeName} runtime`}
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-sm bg-muted text-muted-foreground',
          className
        )}
      >
        <TerminalSquare className="h-3 w-3" />
      </div>
    )
  }

  return (
    <img
      src={PROVIDER_LOGOS[provider]}
      alt={`${runtimeName} provider`}
      className={cn('h-4 w-4 object-contain', PROVIDER_LOGO_CLASSES[provider], className)}
    />
  )
}

type ExternalRuntimeStoredRun = ExternalRuntimeRunRecord | ExternalRuntimeRunResult

const EMPTY_EVENTS: ExternalRuntimeEvent[] = []
const MAX_PROGRESS_TEXT_LENGTH = 180

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function compactText(value: string | undefined, maxLength = MAX_PROGRESS_TEXT_LENGTH): string {
  if (!value) {
    return ''
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 3)}...`
}

function isRunStatus(value: string): value is ExternalRuntimeRunStatus {
  return [
    'queued',
    'starting',
    'running',
    'awaiting-approval',
    'completed',
    'failed',
    'cancelled'
  ].includes(value)
}

function normalizeArtifacts(value: unknown): ExternalRuntimeRunArtifact[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }

      const normalized: ExternalRuntimeRunArtifact = {
        id: asString(record.id) || '',
        name: asString(record.name) || 'artifact',
        path: asString(record.path) || '',
        relativePath: asString(record.relativePath) || asString(record.relative_path) || '',
        type: (asString(record.type) as ExternalRuntimeRunArtifact['type']) || 'unknown',
        sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : 0,
        importKind:
          (asString(record.importKind) as ExternalRuntimeRunArtifact['importKind']) || 'none',
        mimeType: asString(record.mimeType) || null
      }

      return normalized
    })
    .filter((entry): entry is ExternalRuntimeRunArtifact => Boolean(entry))
}

function normalizeStagedInputs(value: unknown): ExternalRuntimeStagedInput[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }

      const normalized: ExternalRuntimeStagedInput = {
        id: asString(record.id) || '',
        label: asString(record.label) || 'input',
        kind: (asString(record.kind) as ExternalRuntimeStagedInput['kind']) || 'metadata',
        sourcePath: asString(record.sourcePath) || asString(record.source_path) || null,
        stagedPath: asString(record.stagedPath) || asString(record.staged_path) || '',
        status: (asString(record.status) as ExternalRuntimeStagedInput['status']) || 'skipped'
      }

      const note = asString(record.note)
      if (note) {
        normalized.note = note
      }

      return normalized
    })
    .filter((entry): entry is ExternalRuntimeStagedInput => Boolean(entry))
}

function normalizeExternalRuntimeRun(value: unknown): ExternalRuntimeDisplayRun | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const runtimeId = asString(record.runtimeId) || asString(record.runtime_id) || 'runtime'
  const runtimeName = asString(record.runtimeName) || asString(record.runtime_name) || 'Runtime'
  const runId = asString(record.runId) || asString(record.run_id)
  const statusValue = asString(record.status)
  if (!runId || !statusValue || !isRunStatus(statusValue)) {
    return null
  }

  return {
    runtimeId,
    runtimeName,
    runId,
    status: statusValue,
    goal: asString(record.goal),
    chatId: asString(record.chatId) || asString(record.chat_id),
    model: asString(record.model),
    summary: asString(record.summary) || null,
    error: asString(record.error) || asString(record.message) || null,
    workspacePath: asString(record.workspacePath) || asString(record.workspace_path),
    outputsPath: asString(record.outputsPath) || asString(record.outputs_path),
    manifestPath: asString(record.manifestPath) || asString(record.manifest_path),
    startedAt: asString(record.startedAt) || asString(record.started_at),
    updatedAt: asString(record.updatedAt) || asString(record.updated_at),
    completedAt: asString(record.completedAt) || asString(record.completed_at) || null,
    artifacts: normalizeArtifacts(record.artifacts),
    stagedInputs: normalizeStagedInputs(record.stagedInputs || record.staged_inputs)
  }
}

type RunStatusCategory = 'active' | 'completed' | 'failed' | 'waiting'

function categorizeStatus(status: ExternalRuntimeRunStatus): RunStatusCategory {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'failed':
    case 'cancelled':
      return 'failed'
    case 'awaiting-approval':
      return 'waiting'
    default:
      return 'active'
  }
}

const statusStyles: Record<
  RunStatusCategory,
  { border: string; bg: string; icon: string; accent: string }
> = {
  active: {
    border: 'border-border',
    bg: 'bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-950/40 dark:to-sky-900/30',
    icon: 'text-sky-600 dark:text-sky-400',
    accent: 'text-sky-600 dark:text-sky-400'
  },
  completed: {
    border: 'border-border',
    bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
    accent: 'text-emerald-600 dark:text-emerald-400'
  },
  failed: {
    border: 'border-border',
    bg: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/30',
    icon: 'text-red-600 dark:text-red-400',
    accent: 'text-red-600 dark:text-red-400'
  },
  waiting: {
    border: 'border-border',
    bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/30',
    icon: 'text-amber-600 dark:text-amber-400',
    accent: 'text-amber-600 dark:text-amber-400'
  }
}

function getStatusLabel(status: ExternalRuntimeRunStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'awaiting-approval':
      return 'Awaiting Approval'
    case 'running':
    case 'starting':
      return 'Running'
    case 'queued':
      return 'Queued'
    default:
      return status
  }
}

function StatusIcon({
  category,
  className
}: {
  category: RunStatusCategory
  className?: string
}): React.JSX.Element {
  const styles = statusStyles[category]
  switch (category) {
    case 'completed':
      return <CheckCircle className={cn('h-3.5 w-3.5', styles.accent, className)} />
    case 'failed':
      return <XCircle className={cn('h-3.5 w-3.5', styles.accent, className)} />
    case 'waiting':
      return <ShieldAlert className={cn('h-3.5 w-3.5', styles.accent, className)} />
    default:
      return <Loader2 className={cn('h-3.5 w-3.5 animate-spin', styles.accent, className)} />
  }
}

function isActiveStatus(status: ExternalRuntimeRunStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'awaiting-approval'
}

function selectActiveRun(
  runs: Record<string, ExternalRuntimeStoredRun>,
  chatId: string | null
): ExternalRuntimeStoredRun | null {
  if (!chatId) {
    return null
  }

  return (
    Object.values(runs)
      .filter((run) => run.chatId === chatId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .find((run) => isActiveStatus(run.status)) || null
  )
}

async function openManagedPath(targetPath: string | undefined): Promise<void> {
  if (!targetPath) {
    return
  }

  const result = await window.ctg.shell.openPath(targetPath)
  if (!result.success) {
    toast.error('Unable to open path', {
      description: result.error
    })
  }
}

function describeEvent(event: ExternalRuntimeEvent): string {
  switch (event.type) {
    case 'status':
      return compactText(event.message || `Status changed to ${event.status || 'unknown'}`)
    case 'command-started':
      return compactText(event.command ? `Running ${event.command}` : 'Command started')
    case 'command-completed':
      return compactText(event.command ? `Completed ${event.command}` : 'Command completed')
    case 'message':
      return compactText(event.text || 'Assistant update')
    case 'turn-completed':
      return compactText(event.message || `Turn completed with status ${event.status || 'unknown'}`)
    case 'artifact-scan-completed':
      return compactText(event.message || 'Artifacts scanned')
    case 'error':
      return compactText(event.message || `${event.runtimeName} reported an error`)
    default:
      return compactText(event.message || `${event.runtimeName} activity`)
  }
}

function PathLink({
  label,
  icon: Icon,
  path
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  path: string | undefined
}): React.JSX.Element | null {
  if (!path) return null
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 text-xs"
      onClick={() => void openManagedPath(path)}
    >
      <Icon className="h-3 w-3" />
      {label}
      <ExternalLink className="h-2.5 w-2.5 opacity-40" />
    </Button>
  )
}

export function ActiveExternalRuntimeRunPanel({
  chatId
}: {
  chatId: string | null
}): React.JSX.Element | null {
  const descriptors = useExternalRuntimeStore((state) => state.descriptors)
  const runs = useExternalRuntimeStore((state) => state.runs)
  const runEventsById = useExternalRuntimeStore((state) => state.runEvents)
  const timelineScrollHostRef = useRef<HTMLDivElement | null>(null)

  const activeRun = useMemo(() => selectActiveRun(runs, chatId), [chatId, runs])
  const runKey = activeRun ? `${activeRun.runtimeId}:${activeRun.runId}` : null
  const runEvents = runKey ? (runEventsById[runKey] ?? EMPTY_EVENTS) : EMPTY_EVENTS

  const timeline = useMemo(
    () =>
      runEvents
        .filter((event) => event.type !== 'message-delta')
        .slice(-4)
        .map((event) => ({
          id: event.eventId,
          text: describeEvent(event),
          createdAt: event.createdAt
        })),
    [runEvents]
  )

  useEffect(() => {
    if (timeline.length === 0) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = timelineScrollHostRef.current?.querySelector(
        '[data-slot="scroll-area-viewport"]'
      )

      if (!(viewport instanceof HTMLElement)) {
        return
      }

      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth'
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [timeline])

  if (!activeRun) {
    return null
  }

  const category = categorizeStatus(activeRun.status)
  const provider = getRuntimeProvider(activeRun.runtimeId, descriptors)

  return (
    <div className="mt-2 mb-2 w-full max-w-100 rounded-md border border-border/40 bg-background">
      <div className="flex items-center gap-2.5 p-3">
        <RuntimeIcon provider={provider} runtimeName={activeRun.runtimeName} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-foreground truncate">
            {activeRun.runtimeName} - Analysis in progress
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {compactText(activeRun.goal || 'Running analysis...', 80)}
          </div>
        </div>
        <StatusIcon category={category} />
      </div>

      <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-1.5">
        {timeline.length > 0 ? (
          <div ref={timelineScrollHostRef}>
            <ScrollArea className="h-28 overscroll-contain">
              <div className="space-y-1">
                {timeline.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 rounded px-2 py-1.5 text-xs"
                  >
                    <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
                    <div className="flex-1 min-w-0 wrap-break-word text-muted-foreground">
                      {event.text}
                    </div>
                    <div className="shrink-0 text-muted-foreground tabular-nums">
                      {new Date(event.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            Waiting for the first update...
          </div>
        )}
      </div>
    </div>
  )
}

export default function ExternalRuntimeRunCard({
  result
}: {
  result: unknown
}): React.JSX.Element | null {
  const descriptors = useExternalRuntimeStore((state) => state.descriptors)
  const refreshRun = useExternalRuntimeStore((state) => state.refreshRun)
  const getRun = useExternalRuntimeStore((state) => state.getRun)
  const normalizedResult = normalizeExternalRuntimeRun(result)
  const storedRun = normalizedResult
    ? getRun(normalizedResult.runtimeId, normalizedResult.runId)
    : undefined
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (normalizedResult?.runId) {
      void refreshRun(normalizedResult.runtimeId, normalizedResult.runId)
    }
  }, [normalizedResult?.runId, normalizedResult?.runtimeId, refreshRun])

  const displayRun = normalizeExternalRuntimeRun(storedRun) || normalizedResult
  if (!displayRun) {
    return null
  }

  const category = categorizeStatus(displayRun.status)
  const styles = statusStyles[category]
  const stagedCount = displayRun.stagedInputs.filter((input) => input.status === 'staged').length
  const provider = getRuntimeProvider(displayRun.runtimeId, descriptors)

  return (
    <div
      className={cn(
        'mt-4 mb-4 w-full max-w-100 rounded-lg border shadow-sm transition-all duration-150',
        styles.border,
        styles.bg
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2.5 cursor-pointer p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5',
          expanded ? 'rounded-t-lg' : 'rounded-lg'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <RuntimeIcon provider={provider} runtimeName={displayRun.runtimeName} />

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-foreground truncate">
            <span className="text-muted-foreground">{displayRun.runtimeName}:</span>{' '}
            {getStatusLabel(displayRun.status)}
          </div>
          {displayRun.summary || displayRun.goal ? (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {compactText(displayRun.summary || displayRun.goal || '', 80)}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <StatusIcon category={category} />
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/20 px-2.5 pt-2.5 pb-4 space-y-2.5 text-xs">
          {displayRun.error && (
            <div className="rounded border border-red-200/60 bg-red-50/60 p-2 text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300 wrap-break-word">
              {displayRun.error}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 pb-1.5">
            <PathLink label="Outputs" icon={FolderOpen} path={displayRun.outputsPath} />
            <PathLink label="Manifest" icon={FileText} path={displayRun.manifestPath} />
            <PathLink label="Workspace" icon={PlayCircle} path={displayRun.workspacePath} />
          </div>

          {displayRun.artifacts.length > 0 && (
            <div>
              <div className="font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Package className="h-3 w-3" />
                Artifacts ({displayRun.artifacts.length})
              </div>
              <div className="space-y-1">
                {displayRun.artifacts.map((artifact) => (
                  <div
                    key={artifact.id || artifact.relativePath}
                    className="flex items-center justify-between gap-2 rounded border border-border/40 bg-muted/20 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {artifact.relativePath || artifact.name}
                      </div>
                      <div className="text-muted-foreground">
                        {artifact.type}
                        {artifact.importKind !== 'none' ? ` / ${artifact.importKind}` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openManagedPath(artifact.path)
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {displayRun.stagedInputs.length > 0 && (
            <div>
              <div className="font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <FileCode2 className="h-3 w-3" />
                Staged Inputs ({stagedCount}/{displayRun.stagedInputs.length})
              </div>
              <div className="space-y-1">
                {displayRun.stagedInputs.slice(0, 6).map((input) => (
                  <div
                    key={input.id}
                    className="flex items-center gap-2 rounded border border-border/40 bg-muted/20 px-2 py-1.5"
                  >
                    {input.status === 'staged' ? (
                      <FileCode2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ShieldAlert className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{input.label}</div>
                      <div className="truncate text-muted-foreground">
                        {input.status === 'staged' ? input.stagedPath : input.note || 'Skipped'}
                      </div>
                    </div>
                  </div>
                ))}
                {displayRun.stagedInputs.length > 6 && (
                  <div className="text-muted-foreground px-2">
                    +{displayRun.stagedInputs.length - 6} more
                  </div>
                )}
              </div>
            </div>
          )}

          {displayRun.artifacts.length === 0 &&
            displayRun.stagedInputs.length === 0 &&
            !displayRun.error && (
              <div className="text-muted-foreground px-2 py-1">
                No artifacts or staged inputs for this run.
              </div>
            )}
        </div>
      )}
    </div>
  )
}
