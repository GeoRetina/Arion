import React from 'react'
import { Layers } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { basemaps, type BasemapDefinition } from '../config/map-styles'

interface BasemapSwitcherProps {
  activeBasemapId: string
  onSelect: (basemapId: string) => void
}

const BasemapThumbnail: React.FC<{
  basemap: BasemapDefinition
  isActive: boolean
  onSelect: () => void
}> = ({ basemap, isActive, onSelect }) => (
  <button
    onClick={onSelect}
    className={cn(
      'group flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-colors cursor-pointer',
      isActive ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-muted/50'
    )}
  >
    <div
      className={cn(
        'w-14 h-14 rounded-md overflow-hidden border transition-colors',
        isActive ? 'border-primary' : 'border-border group-hover:border-muted-foreground/40'
      )}
    >
      <img
        src={basemap.thumbnail}
        alt={basemap.name}
        className="w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </div>
    <span
      className={cn(
        'text-[11px] leading-tight font-medium truncate max-w-16',
        isActive ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      {basemap.name}
    </span>
  </button>
)

export const BasemapSwitcher: React.FC<BasemapSwitcherProps> = ({
  activeBasemapId,
  onSelect
}) => {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md hover:bg-muted/50">
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Switch basemap</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="w-[min(90vw,420px)] p-3"
        style={{
          backgroundColor: 'color-mix(in oklch, var(--card) 95%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
      >
        <div className="grid grid-cols-5 gap-2">
          {basemaps.map((basemap) => (
            <BasemapThumbnail
              key={basemap.id}
              basemap={basemap}
              isActive={basemap.id === activeBasemapId}
              onSelect={() => onSelect(basemap.id)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
