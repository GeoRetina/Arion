import React from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { useLayerSync } from '../../../hooks/use-layer-sync'
import { MapCanvas } from './map-canvas'
import { useMapIpc } from '../hooks/use-map-ipc'
import { useMapLibreRasterProtocol } from '../hooks/use-maplibre-raster-protocol'

interface MapDisplayProps {
  style: StyleSpecification
  isVisible: boolean
}

export const MapDisplay: React.FC<MapDisplayProps> = ({ style, isVisible }) => {
  useMapLibreRasterProtocol()
  useLayerSync()
  useMapIpc()

  return (
    <div className="h-full w-full relative">
      <MapCanvas style={style} isVisible={isVisible} />
    </div>
  )
}
