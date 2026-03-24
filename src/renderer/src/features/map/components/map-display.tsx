import React from 'react'
import { useLayerSync } from '../../../hooks/use-layer-sync'
import { MapCanvas } from './map-canvas'
import { osmRasterStyle } from '../config/map-styles'
import { useMapIpc } from '../hooks/use-map-ipc'
import { useMapLibreRasterProtocol } from '../hooks/use-maplibre-raster-protocol'

interface MapDisplayProps {
  isVisible: boolean
}

export const MapDisplay: React.FC<MapDisplayProps> = ({ isVisible }) => {
  useMapLibreRasterProtocol()
  useLayerSync()
  useMapIpc()

  return (
    <div className="h-full w-full relative">
      <MapCanvas style={osmRasterStyle} isVisible={isVisible} />
    </div>
  )
}
