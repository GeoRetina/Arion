import React, { useState } from 'react'
import { useLayerSync } from '../../../hooks/use-layer-sync'
import { MapCanvas } from './map-canvas'
import { MapSearchBox } from './map-search-box'
import { osmRasterStyle } from '../config/map-styles'
import { useMapNavigation } from '../hooks/use-map-navigation'
import { useMapIpc } from '../hooks/use-map-ipc'

interface MapDisplayProps {
  isVisible: boolean
}

export const MapDisplay: React.FC<MapDisplayProps> = ({ isVisible }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  useLayerSync()
  useMapIpc()

  const { navigateToResult } = useMapNavigation()

  return (
    <div className="h-full w-full relative">
      <MapCanvas
        style={osmRasterStyle}
        isVisible={isVisible}
        onSearchClick={() => setIsSearchOpen((prev) => !prev)}
      />
      {isVisible && (
        <>
          {isSearchOpen && (
            <MapSearchBox
              onSelectResult={navigateToResult}
              onClose={() => setIsSearchOpen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
