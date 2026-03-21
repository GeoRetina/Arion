import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ExternalAgentIntegrationCardProps {
  title: string
  description: string
  summary?: string
  iconSrc: string
  iconClassName?: string
  statusLabel: string
  statusClassName?: string
  enabled: boolean
  onToggleEnabled: () => void
  onConfigure: () => void
  action?: ReactNode
}

export default function ExternalAgentIntegrationCard({
  title,
  description,
  summary,
  iconSrc,
  iconClassName,
  statusLabel,
  statusClassName,
  enabled,
  onToggleEnabled,
  onConfigure,
  action
}: ExternalAgentIntegrationCardProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        'overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border',
        !enabled && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-muted flex items-center justify-center p-1.5">
          <img
            src={iconSrc}
            alt={`${title} logo`}
            className={cn('h-full w-full object-contain', iconClassName)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{title}</span>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={enabled}
            onCheckedChange={onToggleEnabled}
            aria-label={enabled ? 'Disable integration' : 'Enable integration'}
          />
          {action}
          <Badge
            variant="outline"
            className={cn('text-xs border-border/70 bg-background text-foreground', statusClassName)}
          >
            {statusLabel}
          </Badge>
        </div>
      </div>

      {summary && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
        </div>
      )}

      <div className="border-t border-border/40 px-4 py-2">
        <Button onClick={onConfigure} size="sm" variant="default" className="h-7 text-xs">
          Configure
        </Button>
      </div>
    </Card>
  )
}
