import React, { useRef, useEffect, useState } from 'react'
import maplibregl, { Map, StyleSpecification, NavigationControl, ScaleControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapStore } from '../../../stores/map-store'
import { initializeMapIpcListeners, cleanupMapIpcListeners } from '../../../lib/ipc/map-ipc-manager'

interface MapDisplayProps {
  isVisible: boolean
  preload?: boolean // Optional prop to preload the map even when not visible
}

// Define the OSM Raster Tile style
const osmRasterStyle: StyleSpecification = {
  version: 8,
  sources: {
    'osm-raster-tiles': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    {
      id: 'osm-raster-layer',
      type: 'raster',
      source: 'osm-raster-tiles',
      minzoom: 0,
      maxzoom: 19 // OSM raster tiles generally go up to zoom 19
    }
  ]
}

export const MapDisplay: React.FC<MapDisplayProps> = ({
  isVisible,
  preload = false // Default to false if not provided
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const map = useRef<Map | null>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const setMapInstanceInStore = useMapStore((state) => state.setMapInstance)
  const setMapReadyForOperations = useMapStore((state) => state.setMapReadyForOperations)

  // Initialize map once on component mount or when preload becomes true
  useEffect(() => {
    // Initialize map if container exists and either it should be preloaded or is visible
    if (!mapContainer.current || map.current !== null) return

    try {
      console.log('Initializing MapLibre GL map')
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: osmRasterStyle,
        center: [0, 0],
        zoom: 1,
        renderWorldCopies: true,
        fadeDuration: 0 // Disable fade animations for smoother appearance
      })

      const currentMapInstance = map.current
      setMapInstanceInStore(currentMapInstance)
      setMapReadyForOperations(false)

      currentMapInstance.on('load', () => {
        console.log('MapLibre GL map loaded.')
        setIsMapLoaded(true)
        // Readiness will be fully determined by the visibility useEffect after resize

        // Ensure map is sized correctly
        if (currentMapInstance) {
          currentMapInstance.resize()
          // Add navigation control once the map is loaded
          const navigationControl = new NavigationControl({
            visualizePitch: true,
            showCompass: true,
            showZoom: true
          })
          currentMapInstance.addControl(navigationControl, 'top-right')

          // Add scale control
          const scaleControl = new ScaleControl({
            maxWidth: 100, // Max width of the scale control in pixels
            unit: 'metric' // Use 'imperial' or 'metric' or 'nautical'
          })
          currentMapInstance.addControl(scaleControl, 'bottom-left')
        }
      })

      currentMapInstance.on('error', (e) => {
        console.error('MapLibre GL error:', e)
      })
    } catch (error) {
      console.error('Failed to initialize MapLibre GL:', error)
    }
  }, [])

  // Handle visibility changes
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    const triggerResize = () => {
      if (
        map.current &&
        mapContainer.current &&
        mapContainer.current.offsetParent !== null && // Check if it's part of layout
        mapContainer.current.offsetWidth > 0 && // Check if width is > 0
        mapContainer.current.offsetHeight > 0 // Check if height is > 0
      ) {
        console.log('[MapDisplay] Resizing map instance.')
        map.current.resize()
        setMapReadyForOperations(true)
      } else {
        console.warn(
          '[MapDisplay] Skipping resize: map instance or container not ready, or container has zero dimensions.'
        )
        setMapReadyForOperations(false)
      }
    }

    if (isVisible) {
      // Debounce the resize calls to ensure the container is ready after CSS transitions
      const resizeTimeout = setTimeout(() => {
        triggerResize()
      }, 100) // Adjust delay as needed, 100ms is a common starting point

      return () => clearTimeout(resizeTimeout)
    } else {
      setMapReadyForOperations(false)
    }
  }, [isVisible, isMapLoaded, setMapReadyForOperations])

  // Clean up on component unmount
  useEffect(() => {
    const mapToClean = map.current
    return () => {
      if (mapToClean) {
        console.log('Destroying MapLibre GL map instance.')
        setMapInstanceInStore(null)
        mapToClean.remove()
        setIsMapLoaded(false)
      }
      if (map.current === mapToClean) {
        map.current = null
      }
    }
  }, [setMapInstanceInStore, setMapReadyForOperations])

  // Effect for initializing and cleaning up IPC listeners
  useEffect(() => {
    console.log('[MapDisplay] Initializing IPC listeners for map features.')
    initializeMapIpcListeners()
    return () => {
      console.log('[MapDisplay] Cleaning up IPC listeners for map features.')
      cleanupMapIpcListeners()
    }
  }, [])

  return (
    <div
      ref={mapContainer}
      className="h-full w-full"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 300ms ease-in-out',
        visibility: isVisible ? 'visible' : 'hidden',
        position: 'relative'
      }}
    />
  )
}
