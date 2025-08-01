/**
 * Layer Synchronization Hook
 * 
 * React hook that manages the integration between LayerStore, LayerSyncService, and MapStore.
 * This hook ensures proper initialization, cleanup, and synchronization of layer management.
 */

import { useEffect, useRef } from 'react'
import { layerSyncService } from '../services/layer-sync-service'
import { useLayerStore } from '../stores/layer-store'
import { useMapStore } from '../stores/map-store'

export function useLayerSync() {
  const mapInstance = useMapStore(state => state.mapInstance)
  const isMapReady = useMapStore(state => state.isMapReadyForOperations)
  const loadFromPersistence = useLayerStore(state => state.loadFromPersistence)
  const saveToPersistence = useLayerStore(state => state.saveToPersistence)
  const isDirty = useLayerStore(state => state.isDirty)
  
  // Track initialization state
  const isInitializedRef = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize layer sync when map is ready
  useEffect(() => {
    if (!mapInstance || !isMapReady) {
      console.log('[useLayerSync] Map not ready, waiting...', { mapInstance: !!mapInstance, isMapReady })
      return
    }

    if (isInitializedRef.current) {
      console.log('[useLayerSync] Already initialized, skipping...')
      return
    }

    console.log('[useLayerSync] Initializing layer synchronization')

    // Initialize sync service with map
    layerSyncService.initialize(mapInstance)
    
    // Don't load layers from persistence automatically
    // Only session-imported layers should be displayed on the map
    console.log('[useLayerSync] Layer sync initialized - session layers only will be shown')
    isInitializedRef.current = true

    return () => {
      console.log('[useLayerSync] Cleaning up layer sync')
      layerSyncService.destroy()
      isInitializedRef.current = false
    }
  }, [mapInstance, isMapReady, loadFromPersistence])

  // Auto-save when store becomes dirty (debounced)
  useEffect(() => {
    if (!isDirty || !isInitializedRef.current) {
      return
    }

    console.log('[useLayerSync] Store is dirty, scheduling auto-save')

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Schedule save with debounce
    saveTimeoutRef.current = setTimeout(() => {
      console.log('[useLayerSync] Performing auto-save of persistent layers only')
      saveToPersistence()
        .then(() => {
          console.log('[useLayerSync] Auto-save completed')
        })
        .catch(error => {
          console.error('[useLayerSync] Auto-save failed:', error)
        })
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
    isInitialized: isInitializedRef.current,
    syncService: layerSyncService
  }
}

/**
 * Hook for accessing layer sync statistics
 */
export function useLayerSyncStats() {
  const { syncService } = useLayerSync()
  
  return {
    getStats: () => syncService.getStats(),
    forceSyncAll: () => syncService.forceSyncAll()
  }
}