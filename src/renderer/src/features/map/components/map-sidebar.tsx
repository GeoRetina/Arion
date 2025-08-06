import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, Menu } from 'lucide-react'
import { MapDisplay } from './map-display'
import { LayersPanel } from './layers-panel'

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

  const handleToggleLayersPanel = () => {
    setIsLayersPanelExpanded(!isLayersPanelExpanded)
  }

  // Effect to trigger resize when sidebar visibility changes
  // useEffect(() => {
  //   // When visibility changes, force window resize to ensure map renders correctly
  //   window.dispatchEvent(new Event('resize'))

  //   // Schedule additional resize events for smoother transition
  //   const delays = [100, 200, 300, 400, 500]
  //   delays.forEach((delay) => {
  //     setTimeout(() => window.dispatchEvent(new Event('resize')), delay)
  //   })
  // }, [isMapSidebarExpanded])

  return (
    <div
      ref={containerRef}
      className="h-full w-full flex flex-col bg-card/70 backdrop-blur-sm border-l border-border/50"
    >
      {/* Header with buttons */}
      <div className="p-3 flex items-center z-10 bg-card/95 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleLayersPanel}
          className="h-7 w-7 rounded-md hover:!bg-muted"
          title="Toggle layers panel"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex-1"></div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMapSidebar}
          className="h-7 w-7 rounded-md hover:!bg-muted mr-3"
          title="Close map panel"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Map container */}
      <div className="flex-grow h-[calc(100%-48px)] w-full p-3 pt-0">
        <div className="h-full w-full rounded-md overflow-hidden relative">
          <MapDisplay isVisible={isMapSidebarExpanded} />
          <LayersPanel isExpanded={isLayersPanelExpanded} />
        </div>
      </div>
    </div>
  )
}
