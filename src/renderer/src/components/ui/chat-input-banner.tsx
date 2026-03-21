import React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChatInputBannerProps {
  /** Icon displayed on the left */
  icon?: React.ReactNode
  /** Main content of the banner */
  children: React.ReactNode
  /** Optional action element on the right (e.g. a link or button) */
  action?: React.ReactNode
  /** If set (0–100), renders a progress bar at the bottom */
  progress?: number
  /** Callback to dismiss; shows an X button when provided */
  onDismiss?: () => void
  /** Visual variant */
  variant?: 'default' | 'success' | 'error' | 'warning'
}

const progressBarColor: Record<NonNullable<ChatInputBannerProps['variant']>, string> = {
  default: 'bg-primary',
  success: 'bg-emerald-500',
  error: 'bg-destructive',
  warning: 'bg-yellow-500'
}

export const ChatInputBanner: React.FC<ChatInputBannerProps> = ({
  icon,
  children,
  action,
  progress,
  onDismiss,
  variant = 'default'
}) => {
  const clampedProgress =
    progress != null ? Math.max(0, Math.min(100, Math.round(progress))) : undefined

  return (
    <div className="px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0">{icon}</span>}

        <span className="min-w-0 flex-1 truncate">{children}</span>

        {action && <span className="shrink-0">{action}</span>}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {clampedProgress != null && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300 ease-out',
              progressBarColor[variant]
            )}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
      )}
    </div>
  )
}
