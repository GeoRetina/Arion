import React, { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

export interface MapToolbarItem {
  id: string
  icon: ReactNode
  label: string
  onClick: () => void
  isActive?: boolean
}

interface MapToolbarProps {
  /** Items rendered on the left side of the toolbar */
  leftItems?: MapToolbarItem[]
  /** Items rendered on the right side of the toolbar */
  rightItems?: MapToolbarItem[]
  /** Basemap switcher element rendered in the center */
  basemapSwitcher?: ReactNode
}

const ToolbarButton: React.FC<{ item: MapToolbarItem }> = ({ item }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        onClick={item.onClick}
        className={`h-8 w-8 rounded-md ${item.isActive ? 'bg-muted' : 'hover:bg-muted/50'}`}
      >
        {item.icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">{item.label}</TooltipContent>
  </Tooltip>
)

export const MapToolbar: React.FC<MapToolbarProps> = ({
  leftItems = [],
  rightItems = [],
  basemapSwitcher
}) => {
  if (leftItems.length === 0 && rightItems.length === 0 && !basemapSwitcher) return null

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div
        className="flex items-center gap-3 px-5 py-1.5 rounded-full border border-border"
        style={{
          backgroundColor: 'color-mix(in oklch, var(--card) 85%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
        }}
      >
        {leftItems.map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}
        {basemapSwitcher}
        {rightItems.map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
