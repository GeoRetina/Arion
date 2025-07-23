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

  // Determine status colors
  const statusColor =
    status === 'loading'
      ? 'border-primary/50 bg-primary/5'
      : status === 'completed'
        ? 'border-secondary-500/50 bg-secondary-500/5'
        : 'border-red-500/50 bg-red-500/5'

  return (
    <div
      className={cn(
        'my-2 w-full max-w-[300px] sm:max-w-xs min-w-36 text-sm rounded-md border shadow-sm',
        statusColor,
        className
      )}
    >
      <div
        className="flex items-center gap-2 cursor-pointer p-2 border-b border-border/10 transition-colors hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />

        <span className="font-medium text-xs text-foreground mr-1 truncate flex-1">{toolName}</span>

        {status === 'loading' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        {status === 'completed' && <CheckCircle className="h-3 w-3 text-secondary-500" />}
        {status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}

        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="p-2 text-xs">
          {/* Arguments ScrollArea */}
          <div className="mb-2">
            <div className="text-xs text-muted-foreground mb-1">Arguments</div>
            <div className="rounded-md border border-border/30 bg-background">
              <ScrollArea className="h-24 w-full">
                <div className="p-2 bg-background">
                  <div className="whitespace-pre-wrap break-words text-foreground">
                    {formattedArgs}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Error Message - show if in error state */}
          {status === 'error' && errorMessage && (
            <div className="mt-2">
              <div className="text-xs text-red-500 mb-1 flex items-center">
                <AlertTriangle className="h-3 w-3 mr-1" />
                <span className="font-medium">Error</span>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-2">
                <div className="text-red-700 dark:text-red-400 whitespace-pre-wrap break-words">
                  {errorMessage}
                </div>
              </div>
            </div>
          )}

          {/* Results ScrollArea - only shown when completed with results */}
          {status === 'completed' && result && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1 flex items-center">
                <span className="text-secondary-500 font-medium">Result</span>
              </div>
              <div className="rounded-md border border-border/30 bg-background">
                <ScrollArea className="h-40 w-full">
                  <div className="p-2 bg-background">
                    <div className="whitespace-pre-wrap break-words text-foreground">
                      {formattedResult}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Missing Required Parameters Check */}
          {status === 'loading' && (
            <div className="mt-2 text-amber-500 flex items-start gap-1.5 text-xs">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <div>
                <p>Tool may be missing required parameters.</p>
                <p className="mt-1 text-muted-foreground">
                  The <code className="bg-muted px-1 py-0.5 rounded text-xs">set_layer_style</code>{' '}
                  tool requires both{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">source_id</code> and
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">paint</code> parameters.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ToolCallDisplay
