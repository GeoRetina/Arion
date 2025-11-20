import { useCallback } from 'react'
import { useMapStore } from '../../../stores/map-store'
import { GeocodingResult } from './use-geocoding-search'

interface UseMapNavigationOptions {
  defaultZoom?: number
  fitBoundsPadding?: number
  animationDuration?: number
}

/**
 * Custom hook for handling map navigation based on geocoding results
 * Provides functionality to fly to locations or fit bounds based on search results
 */
export const useMapNavigation = ({
  defaultZoom = 14,
  fitBoundsPadding = 50,
  animationDuration = 1000
}: UseMapNavigationOptions = {}) => {
  const map = useMapStore((state) => state.mapInstance)
  const isMapReady = useMapStore((state) => state.isMapReadyForOperations)

  const navigateToResult = useCallback(
    (result: GeocodingResult) => {
      if (!map || !isMapReady) return

      const [lng, lat] = result.coordinates

      // If bbox is available, fit to bounds, otherwise fly to point
      if (result.bbox) {
        const [minLng, minLat, maxLng, maxLat] = result.bbox
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat]
          ],
          {
            padding: fitBoundsPadding,
            duration: animationDuration
          }
        )
      } else {
        map.flyTo({
          center: [lng, lat],
          zoom: defaultZoom,
          duration: animationDuration
        })
      }
    },
    [map, isMapReady, defaultZoom, fitBoundsPadding, animationDuration]
  )

  return { navigateToResult }
}
