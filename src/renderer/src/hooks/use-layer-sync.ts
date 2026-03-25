/**
 * Layer Synchronization Hook
 *
 * React hook that manages the integration between LayerStore and MapStore.
 * This hook ensures proper initialization and cleanup of layer management.
 */

import { useEffect, useRef } from 'react'
import { sortLayersForMapSync } from '../../../shared/lib/layer-order'
import { useLayerStore } from '../stores/layer-store'
import { useMapStore } from '../stores/map-store'

export function useLayerSync(): { isInitialized: boolean } {
  const mapInstance = useMapStore((state) => state.mapInstance)
  const isMapReady = useMapStore((state) => state.isMapReadyForOperations)
  const setMapInstance = useLayerStore((state) => state.setMapInstance)
  const saveToPersistence = useLayerStore((state) => state.saveToPersistence)
  const isDirty = useLayerStore((state) => state.isDirty)
  const syncLayerToMap = useLayerStore((state) => state.syncLayerToMap)

  // Track initialization state
  const isInitializedRef = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Set map instance in LayerStore when map is ready
  useEffect(() => {
    if (!mapInstance || !isMapReady) {
      // Clear map instance if map is not ready
      setMapInstance(null).catch(() => {})
      return
    }

    if (isInitializedRef.current) {
      return
    }

    // Set map instance in LayerStore - this enables direct map operations and syncs existing layers
    setMapInstance(mapInstance)
      .then(() => {
        isInitializedRef.current = true
      })
      .catch(() => {})

    return () => {
      setMapInstance(null).catch(() => {})
      isInitializedRef.current = false
    }
  }, [mapInstance, isMapReady, setMapInstance])

  // Catch up any layers that were added before the map became ready.
  // We intentionally read from the latest store snapshot here instead of replaying
  // every historical `layers` render, which can otherwise re-add a layer that was
  // already removed during a fast chat switch/reset.
  useEffect(() => {
    if (!mapInstance || !isMapReady) return

    const visibleLayers = sortLayersForMapSync(useLayerStore.getState().layers.values()).filter(
      (layer) => layer.visibility
    )
    visibleLayers.forEach((layer) => {
      syncLayerToMap(layer).catch(() => {})
    })
  }, [mapInstance, isMapReady, syncLayerToMap])

  // Auto-save when store becomes dirty (debounced)
  useEffect(() => {
    if (!isDirty || !isInitializedRef.current) {
      return
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Schedule save with debounce
    saveTimeoutRef.current = setTimeout(() => {
      saveToPersistence()
        .then(() => {})
        .catch(() => {})
    }, 1000) // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [isDirty, saveToPersistence])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
    isInitialized: isInitializedRef.current
  }
}
