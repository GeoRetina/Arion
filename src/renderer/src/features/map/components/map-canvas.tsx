import React, { useEffect, useRef, useState } from 'react'
import maplibregl, {
  Map,
  NavigationControl,
  ScaleControl,
  StyleSpecification
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map-canvas.css'
import { useMapStore } from '../../../stores/map-store'

interface MapCanvasProps {
  style: StyleSpecification
  isVisible: boolean
}

export const MapCanvas: React.FC<MapCanvasProps> = ({ style, isVisible }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const setMapInstance = useMapStore((state) => state.setMapInstance)
  const setMapReadyForOperations = useMapStore((state) => state.setMapReadyForOperations)

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const mapInstance = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [0, 0],
      zoom: 1,
      renderWorldCopies: true,
      fadeDuration: 0
    })

    mapRef.current = mapInstance
    setMapInstance(mapInstance)

    mapInstance.on('load', () => {
      setIsMapLoaded(true)
      setMapReadyForOperations(true)

      mapInstance.resize()

      const navigationControl = new NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true
      })
      mapInstance.addControl(navigationControl, 'top-right')

      const scaleControl = new ScaleControl({
        maxWidth: 100,
        unit: 'metric'
      })
      mapInstance.addControl(scaleControl, 'bottom-left')
    })

    mapInstance.on('error', () => {})

    return () => {
      setMapInstance(null)
      setMapReadyForOperations(false)
      setIsMapLoaded(false)
      mapRef.current = null
      mapInstance.remove()
    }
  }, [style, setMapInstance, setMapReadyForOperations])

  // Handle visibility changes and resizing
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    if (isVisible) {
      const resizeTimeout = setTimeout(() => {
        const container = containerRef.current
        if (
          container &&
          container.offsetParent !== null &&
          container.offsetWidth > 0 &&
          container.offsetHeight > 0
        ) {
          mapRef.current?.resize()
        }
      }, 100)

      return () => clearTimeout(resizeTimeout)
    }

    return undefined
  }, [isVisible, isMapLoaded])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 300ms ease-in-out',
        position: 'relative',
        pointerEvents: isVisible ? 'auto' : 'none'
      }}
    />
  )
}
