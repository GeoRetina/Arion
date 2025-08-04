'use client'

import React, { useMemo } from 'react'
import {
  CheckCircle,
  Loader2,
  XCircle,
  Users,
  ChevronDown,
  ChevronRight,
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useState } from 'react'

interface AgentCallDisplayProps {
  agentName?: string
  agentId: string
  message: string
  status: 'loading' | 'completed' | 'error'
  result?: any
  className?: string
}

const AgentCallDisplay: React.FC<AgentCallDisplayProps> = ({
  agentName,
  agentId,
  message,
  status,
  result,
  className
}) => {
  const [expanded, setExpanded] = useState(false)

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
    return 'Agent call failed'
  }, [status, result])

  // Determine status colors and styling
  const statusStyles = {
    loading: {
      border: 'border-amber-200 dark:border-amber-800/50',
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10',
      icon: 'text-amber-600 dark:text-amber-400',
      accent: 'text-amber-600 dark:text-amber-400'
    },
    completed: {
      border: 'border-emerald-200 dark:border-emerald-800/50',
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10',
      icon: 'text-emerald-600 dark:text-emerald-400',
      accent: 'text-emerald-600 dark:text-emerald-400'
    },
    error: {
      border: 'border-red-200 dark:border-red-800/50',
      bg: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10',
      icon: 'text-red-600 dark:text-red-400',
      accent: 'text-red-600 dark:text-red-400'
    }
  }

  const currentStyles = statusStyles[status]
  
  // For loading state without agent name, format the ID nicely
  // For completed state, we should have the agent name from the result
  const displayName = agentName || (status === 'loading' ? `Agent ${agentId}` : agentId)

  return (
    <div
      className={cn(
        'my-2 w-full max-w-[350px] rounded-lg border shadow-sm transition-all duration-150',
        currentStyles.border,
        currentStyles.bg,
        className
      )}
    >
      <div
        className="flex items-center gap-2.5 cursor-pointer p-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <Users className={cn('h-4 w-4', currentStyles.icon)} />

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-foreground truncate">
            Calling agent: {displayName}
          </div>
          {status === 'loading' && (
            <div className="text-xs text-muted-foreground">
              Processing...
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {status === 'loading' && (
            <Loader2 className={cn('h-3.5 w-3.5 animate-spin', currentStyles.accent)} />
          )}
          {status === 'completed' && (
            <CheckCircle className={cn('h-3.5 w-3.5', currentStyles.accent)} />
          )}
          {status === 'error' && (
            <XCircle className={cn('h-3.5 w-3.5', currentStyles.accent)} />
          )}

          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/20 p-2.5 space-y-2.5 text-xs">
          {/* Message/Task */}
          <div>
            <div className="font-medium text-muted-foreground mb-1">Task</div>
            <div className="rounded border border-border/40 bg-muted/20 p-2">
              <div className="whitespace-pre-wrap break-words text-foreground">
                {message}
              </div>
            </div>
          </div>

          {/* Agent ID (only show if different from name) */}
          {agentName && agentName !== agentId && (
            <div>
              <div className="font-medium text-muted-foreground mb-1">Agent ID</div>
              <div className="font-mono text-foreground/80 bg-muted/20 px-2 py-1 rounded text-xs">
                {agentId}
              </div>
            </div>
          )}

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
                Response
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

          {/* Agent execution in progress */}
          {status === 'loading' && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 rounded p-2">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <div className="font-medium">
                Processing request...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentCallDisplay