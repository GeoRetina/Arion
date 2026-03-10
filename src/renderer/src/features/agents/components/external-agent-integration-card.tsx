import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ExternalAgentIntegrationCardProps {
  title: string
  description: string
  summary?: string
  iconSrc: string
  iconClassName?: string
  statusLabel: string
  statusClassName?: string
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
  onConfigure,
  action
}: ExternalAgentIntegrationCardProps): React.JSX.Element {
  return (
    <Card className="overflow-hidden transition-all surface-elevated gap-0 py-0 border-border/60 hover:border-border">
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
        <div className="flex items-center gap-1 shrink-0">
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
