import React, { useEffect, useRef, useState } from 'react'
import maplibregl, {
  IControl,
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
  onSearchClick: () => void
}

export const MapCanvas: React.FC<MapCanvasProps> = ({ style, isVisible, onSearchClick }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const searchControlRef = useRef<IControl | null>(null)
  const searchClickRef = useRef(onSearchClick)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const setMapInstance = useMapStore((state) => state.setMapInstance)
  const setMapReadyForOperations = useMapStore((state) => state.setMapReadyForOperations)

  useEffect(() => {
    searchClickRef.current = onSearchClick
  }, [onSearchClick])

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

      const searchControl: IControl = (() => {
        let container: HTMLDivElement | null = null
        let button: HTMLButtonElement | null = null
        const handleClick = () => {
          searchClickRef.current?.()
        }

        return {
          onAdd: () => {
            container = document.createElement('div')
            container.className =
              'maplibregl-ctrl maplibregl-ctrl-group maplibregl-ctrl-search-custom'

            button = document.createElement('button')
            button.type = 'button'
            button.className = 'map-search-btn'
            button.setAttribute('aria-label', 'Search for an address')
            button.title = 'Search for an address'
            button.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.65" y1="16.65" x2="21" y2="21" />
              </svg>
            `

            button.addEventListener('click', handleClick)
            container.appendChild(button)
            return container
          },
          onRemove: () => {
            if (button) {
              button.removeEventListener('click', handleClick)
            }
            if (container?.parentNode) {
              container.parentNode.removeChild(container)
            }
            container = null
            button = null
          }
        }
      })()

      searchControlRef.current = searchControl
      mapInstance.addControl(searchControl, 'top-right')
    })

    mapInstance.on('error', () => {})

    return () => {
      if (searchControlRef.current) {
        try {
          mapInstance.removeControl(searchControlRef.current)
        } catch (error) {
          // Control might already be removed with the map instance
        }
        searchControlRef.current = null
      }
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
