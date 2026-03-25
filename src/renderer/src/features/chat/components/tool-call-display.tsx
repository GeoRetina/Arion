'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import {
  CheckCircle,
  Loader2,
  XCircle,
  Terminal,
  ChevronRight,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { useState } from 'react'
import { getToolCallBranding } from '../lib/tool-call-branding'
import { applyNeutralStatusChrome } from '../lib/status-chrome'

interface ToolCallDisplayProps {
  toolName: string
  args: Record<string, unknown>
  status: 'loading' | 'completed' | 'error'
  result?: unknown
  className?: string
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  toolName,
  args,
  status,
  result,
  className
}) => {
  const [expanded, setExpanded] = useState(status === 'loading')
  const hasManuallyToggled = useRef(false)

  // Auto-collapse when status transitions from loading to completed/error
  useEffect(() => {
    if (!hasManuallyToggled.current) {
      setExpanded(status === 'loading')
    }
  }, [status])

  const formattedArgs = useMemo(() => {
    try {
      return JSON.stringify(args, null, 2)
    } catch {
      return 'Invalid arguments'
    }
  }, [args])

  const formattedResult = useMemo(() => {
    if (!result) return ''
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return typeof result === 'string' ? result : 'Invalid result format'
    }
  }, [result])

  // Determine if this is an error result
  const errorMessage = useMemo<string | null>(() => {
    if (status !== 'error') return null

    // Try to extract error message from result
    if (result) {
      if (typeof result === 'string') return result
      if (typeof result === 'object') {
        const resultRecord = result as Record<string, unknown>
        const errorText =
          (typeof resultRecord.error_message === 'string' && resultRecord.error_message) ||
          (typeof resultRecord.message === 'string' && resultRecord.message) ||
          (typeof resultRecord.error === 'string' && resultRecord.error)
        return errorText || JSON.stringify(result, null, 2)
      }
    }
    return 'Tool execution failed'
  }, [status, result])

  // Determine status colors and styling
  const statusStyles = {
    loading: {
      border: 'border-border',
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/30',
      icon: 'text-amber-600 dark:text-amber-400'
    },
    completed: {
      border: 'border-border',
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/30',
      icon: 'text-emerald-600 dark:text-emerald-400'
    },
    error: {
      border: 'border-border',
      bg: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/30',
      icon: 'text-red-600 dark:text-red-400'
    }
  }

  const branding = getToolCallBranding(toolName)
  const useNeutralChrome = status !== 'error'
  const currentStyles = applyNeutralStatusChrome(statusStyles[status], useNeutralChrome)
  const completedResultStyles = {
    accent: 'text-muted-foreground',
    border: 'border-border/40',
    bg: 'bg-muted/20',
    text: 'text-foreground'
  }

  return (
    <div
      className={cn(
        'mt-4 mb-4 w-full max-w-87.5 rounded-lg border shadow-sm transition-all duration-150',
        currentStyles.border,
        currentStyles.bg,
        className
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2.5 cursor-pointer p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5',
          expanded ? 'rounded-t-lg' : 'rounded-lg'
        )}
        onClick={() => {
          hasManuallyToggled.current = true
          setExpanded(!expanded)
        }}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-visible">
          {branding ? (
            <img
              src={branding.iconSrc}
              alt=""
              aria-hidden="true"
              className={cn('h-4 w-4 scale-125 object-contain', branding.iconClassName)}
            />
          ) : (
            <Terminal className={cn('h-4 w-4', currentStyles.icon)} />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-foreground truncate">
            <span className="text-muted-foreground">Calling tool:</span> {toolName}
          </div>
          {status === 'loading' && (
            <div className="text-xs text-muted-foreground">Executing...</div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {status === 'loading' && (
            <Loader2 className={cn('h-3.5 w-3.5 animate-spin', currentStyles.icon)} />
          )}
          {status === 'completed' && (
            <CheckCircle className={cn('h-3.5 w-3.5', currentStyles.icon)} />
          )}
          {status === 'error' && <XCircle className={cn('h-3.5 w-3.5', currentStyles.icon)} />}

          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground transition-transform duration-300',
              expanded && 'rotate-90'
            )}
          />
        </div>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-500 ease-in-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/20 p-2.5 space-y-2.5 text-xs">
            {/* Arguments */}
            <div>
              <div className="font-medium text-muted-foreground mb-1">Arguments</div>
              <div className="rounded border border-border/40 bg-muted/20 overflow-hidden">
                <ScrollArea className="h-24 max-h-32 w-full">
                  <div className="p-2">
                    <pre className="text-foreground font-mono text-xs whitespace-pre">
                      {formattedArgs}
                    </pre>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            </div>

            {/* Error Message - show if in error state */}
            {status === 'error' && errorMessage && (
              <div>
                <div className="font-medium mb-1 flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Error
                </div>
                <div className="rounded border border-red-200/60 bg-red-50/60 dark:border-red-800/40 dark:bg-red-950/20 p-2">
                  <div className="text-red-700 dark:text-red-300 whitespace-pre-wrap wrap-break-word">
                    {errorMessage}
                  </div>
                </div>
              </div>
            )}

            {/* Results - only shown when completed with results */}
            {status === 'completed' && result != null && (
              <div>
                <div
                  className={cn(
                    'font-medium mb-1 flex items-center gap-1',
                    completedResultStyles.accent
                  )}
                >
                  <CheckCircle className="h-3 w-3" />
                  Result
                </div>
                <div
                  className={cn(
                    'rounded border overflow-hidden',
                    completedResultStyles.border,
                    completedResultStyles.bg
                  )}
                >
                  <ScrollArea className="h-24 max-h-32 w-full">
                    <div className="p-2">
                      <div
                        className={cn(
                          'whitespace-pre-wrap wrap-break-word',
                          completedResultStyles.text
                        )}
                      >
                        {formattedResult}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}

            {/* Tool execution in progress */}
            {status === 'loading' && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded p-2',
                  useNeutralChrome
                    ? 'bg-muted/20 text-muted-foreground'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20'
                )}
              >
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                <div className="font-medium">Executing tool...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ToolCallDisplay
