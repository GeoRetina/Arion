import * as React from 'react'
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { cn } from '@/lib/utils'

interface HelpTooltipProps {
  children: React.ReactNode
  className?: string
  iconClassName?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
}

export function HelpTooltip({
  children,
  className,
  iconClassName,
  side = 'top',
  sideOffset = 4
}: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          className={cn(
            'h-4 w-4 text-muted-foreground cursor-help hover:text-foreground transition-colors',
            iconClassName
          )}
        />
      </TooltipTrigger>
      <TooltipContent
        className={cn('max-w-sm', className)}
        side={side}
        sideOffset={sideOffset}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  )
}