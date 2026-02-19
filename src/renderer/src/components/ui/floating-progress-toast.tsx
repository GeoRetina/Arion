import React from 'react'
import { Loader2 } from 'lucide-react'

export interface FloatingProgressToastState {
  title: string
  message: string
  progress: number
}

interface FloatingProgressToastProps {
  state: FloatingProgressToastState
}

export const FloatingProgressToast: React.FC<FloatingProgressToastProps> = ({ state }) => {
  const progress = clampProgress(state.progress)

  return (
    <div className="w-[300px] rounded-md border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="truncate text-sm font-medium">{state.title}</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{state.message}</p>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(progress)))
}
