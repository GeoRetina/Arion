'use client'

import React, { useMemo } from 'react'
import {
  CheckCircle,
  Loader2,
  XCircle,
  Terminal,
  ChevronDown,
  ChevronRight,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useState } from 'react'

interface ToolCallDisplayProps {
  toolName: string
  args: Record<string, any>
  status: 'loading' | 'completed' | 'error'
  result?: any
  className?: string
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  toolName,
  args,
  status,
  result,
  className
}) => {
  const [expanded, setExpanded] = useState(false) // Auto-expand on error

  const formattedArgs = useMemo(() => {
    try {
      return JSON.stringify(args, null, 2)
    } catch (e) {
      return 'Invalid arguments'
    }
  }, [args])

  const formattedResult = useMemo(() => {
    if (!result) return ''
    try {
      return JSON.stringify(result, null, 2)
    } catch (e) {
      return typeof result === 'string' ? result : 'Invalid result format'
    }
  }, [result])

  // Determine if this is an error result
  const errorMessage = useMemo(() => {
    if (status !== 'error') return null

    // Try to extract error message from result
    if (result) {
      if (typeof result === 'string') return result
      if (typeof result === 'object') {
        // Check common error message fields
        return (
          result.error_message || result.message || result.error || JSON.stringify(result, null, 2)
        )
      }
    }
    return 'Tool execution failed'
  }, [status, result])

  // Determine status colors and styling
  const statusStyles = {
    loading: {
      border: 'border-border',
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10',
      icon: 'text-amber-600 dark:text-amber-400'
    },
    completed: {
      border: 'border-border',
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10',
      icon: 'text-emerald-600 dark:text-emerald-400'
    },
    error: {
      border: 'border-border',
      bg: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10',
      icon: 'text-red-600 dark:text-red-400'
    }
  }

  const currentStyles = statusStyles[status]

  return (
    <div
      className={cn(
        'mb-4 w-full max-w-[350px] rounded-lg border shadow-sm transition-all duration-150',
        currentStyles.border,
        currentStyles.bg,
        className
      )}
    >
      <div
        className="flex items-center gap-2.5 cursor-pointer p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <Terminal className={cn('h-4 w-4', currentStyles.icon)} />

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

          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/20 p-2.5 space-y-2.5 text-xs">
          {/* Arguments */}
          <div>
            <div className="font-medium text-muted-foreground mb-1">Arguments</div>
            <div className="rounded border border-border/40 bg-muted/20">
              <ScrollArea className="h-24 max-h-32 w-full">
                <div className="p-2">
                  <div className="whitespace-pre-wrap break-words text-foreground">
                    {formattedArgs}
                  </div>
                </div>
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
                <div className="text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
                  {errorMessage}
                </div>
              </div>
            </div>
          )}

          {/* Results - only shown when completed with results */}
          {status === 'completed' && result && (
            <div>
              <div className="font-medium mb-1 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                Result
              </div>
              <div className="rounded border border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20 overflow-hidden">
                <ScrollArea className="h-24 max-h-32 w-full">
                  <div className="p-2">
                    <div className="whitespace-pre-wrap break-words text-emerald-800 dark:text-emerald-200">
                      {formattedResult}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Tool execution in progress */}
          {status === 'loading' && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 rounded p-2">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <div className="font-medium">Executing tool...</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ToolCallDisplay
