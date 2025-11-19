import React from 'react'
import { Search, Pentagon, MapPin } from 'lucide-react'
import { MapToolbarButton } from './map-toolbar-button'
import { cn } from '@/lib/utils'

interface MapToolbarProps {
  className?: string
  onSearchClick?: () => void
  isSearchActive?: boolean
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
  className,
  onSearchClick,
  isSearchActive = false
}) => {
  return (
    <div
      className={cn(
        'absolute bottom-8 left-1/2 -translate-x-1/2 z-10',
        'flex flex-row gap-6',
        'px-4 py-2 rounded-lg',
        'bg-background/70 backdrop-blur-md',
        'border border-border/50 shadow-md',
        className
      )}
    >
      <MapToolbarButton
        icon={Search}
        label="Search"
        onClick={onSearchClick}
        isActive={isSearchActive}
      />
      <MapToolbarButton
        icon={Pentagon}
        label="Draw Polygon"
        onClick={() => {
          // Functionality will be added later
        }}
      />
      <MapToolbarButton
        icon={MapPin}
        label="Add Point"
        onClick={() => {
          // Functionality will be added later
        }}
      />
    </div>
  )
}
