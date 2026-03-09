import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
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
    <Card className="overflow-hidden transition-all hover:shadow-md flex flex-col surface-elevated">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center p-1.5 shrink-0">
            <img
              src={iconSrc}
              alt={`${title} logo`}
              className={cn('h-full w-full object-contain', iconClassName)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {action}
            <Badge
              variant="outline"
              className={cn('border-border/70 bg-background text-foreground', statusClassName)}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grow px-5 py-3">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      </CardContent>

      <CardFooter className="pt-2 pb-4 px-5 mt-auto">
        <Button onClick={onConfigure} className="w-full" size="default" variant="default">
          Configure
        </Button>
      </CardFooter>
    </Card>
  )
}
