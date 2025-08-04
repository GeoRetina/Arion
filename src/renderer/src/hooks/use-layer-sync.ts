/**
 * Layer Synchronization Hook
 *
 * React hook that manages the integration between LayerStore and MapStore.
 * This hook ensures proper initialization and cleanup of layer management.
 */

import { useEffect, useRef } from 'react'
import { useLayerStore } from '../stores/layer-store'
import { useMapStore } from '../stores/map-store'

export function useLayerSync() {
  const mapInstance = useMapStore((state) => state.mapInstance)
  const isMapReady = useMapStore((state) => state.isMapReadyForOperations)
  const setMapInstance = useLayerStore((state) => state.setMapInstance)
  const saveToPersistence = useLayerStore((state) => state.saveToPersistence)
  const isDirty = useLayerStore((state) => state.isDirty)

  // Track initialization state
  const isInitializedRef = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Set map instance in LayerStore when map is ready
  useEffect(() => {
    if (!mapInstance || !isMapReady) {
      // Clear map instance if map is not ready
      setMapInstance(null).catch((error) => {})
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
      .catch((error) => {})

    return () => {
      setMapInstance(null).catch((error) => {})
      isInitializedRef.current = false
    }
  }, [mapInstance, isMapReady, setMapInstance])

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
        .catch((error) => {})
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

/**
 * Hook for accessing layer management utilities
 */
export function useLayerSyncStats() {
  const { isInitialized } = useLayerSync()

  return {
    isInitialized
  }
}
