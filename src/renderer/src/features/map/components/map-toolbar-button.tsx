import React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface MapToolbarButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  isActive?: boolean
  disabled?: boolean
}

export const MapToolbarButton: React.FC<MapToolbarButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  isActive = false,
  disabled = false
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'transition-all duration-200',
            'hover:bg-primary/10',
            isActive && 'bg-primary/15 border border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'size-8'
          )}
          aria-label={label}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
