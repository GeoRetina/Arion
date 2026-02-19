import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PanelLeftOpen, Layers, Search } from 'lucide-react'
import { MapDisplay } from './map-display'
import { LayersPanel } from './layers-panel'
import { MapToolbar } from './map-toolbar'
import { MapSearchBox } from './map-search-box'
import { useMapNavigation } from '../hooks/use-map-navigation'
import type { MapToolbarItem } from './map-toolbar'

interface MapSidebarProps {
  isMapSidebarExpanded: boolean
  onToggleMapSidebar: () => void
}

export const MapSidebar: React.FC<MapSidebarProps> = ({
  isMapSidebarExpanded,
  onToggleMapSidebar
}) => {
  // Reference to the map container for triggering resize events
  const containerRef = useRef<HTMLDivElement>(null)
  // State for layers panel visibility
  const [isLayersPanelExpanded, setIsLayersPanelExpanded] = useState(false)
  // State for search box visibility
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const { navigateToResult } = useMapNavigation()

  const handleToggleLayersPanel = (): void => {
    setIsLayersPanelExpanded(!isLayersPanelExpanded)
  }

  const handleToggleSearch = (): void => {
    setIsSearchOpen(!isSearchOpen)
  }

  const toolbarItems: MapToolbarItem[] = [
    {
      id: 'layers',
      icon: <Layers className="h-4 w-4" />,
      label: 'Toggle layers',
      onClick: handleToggleLayersPanel,
      isActive: isLayersPanelExpanded
    },
    {
      id: 'search',
      icon: <Search className="h-4 w-4" />,
      label: 'Search address',
      onClick: handleToggleSearch,
      isActive: isSearchOpen
    }
  ]

  return (
    <div
      ref={containerRef}
      className="h-full w-full flex flex-col bg-card/70 backdrop-blur-sm border-l border-border"
    >
      {/* Header with close button */}
      <div className="p-3 flex items-center z-10 bg-card/95 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMapSidebar}
          className="h-7 w-7 rounded-md hover:bg-muted! ml-3"
          title="Close map panel"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>

      {/* Map container */}
      <div className="grow h-[calc(100%-48px)] w-full p-3 pt-0">
        <div className="h-full w-full rounded-md overflow-hidden relative">
          <MapDisplay isVisible={isMapSidebarExpanded} />
          <MapToolbar items={toolbarItems} />
          <LayersPanel isExpanded={isLayersPanelExpanded} onClose={handleToggleLayersPanel} />
          {isMapSidebarExpanded && isSearchOpen && (
            <MapSearchBox
              onSelectResult={navigateToResult}
              onClose={() => setIsSearchOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
