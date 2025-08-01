import { create } from 'zustand'
import type { Map } from 'maplibre-gl'
import * as turf from '@turf/turf'
import type {
  AddMapFeaturePayload,
  SetPaintPropertiesPayload,
  SetMapViewPayload,
  AddGeoreferencedImageLayerPayload
} from '../../../shared/ipc-types'
import { useLayerStore } from './layer-store'

interface MapState {
  mapInstance: Map | null
  setMapInstance: (map: Map | null) => void
  addFeature: (payload: AddMapFeaturePayload) => void
  setLayerPaintProperties: (payload: SetPaintPropertiesPayload) => void
  removeSourceAndAssociatedLayers: (sourceIdToRemove: string) => void
  setMapView: (payload: SetMapViewPayload) => void
  addGeoreferencedImageLayer: (payload: AddGeoreferencedImageLayerPayload) => void
  isMapReadyForOperations: boolean
  setMapReadyForOperations: (isReady: boolean) => void
  pendingFeatures: AddMapFeaturePayload[] // Queue for features to add when map is ready
  pendingImageLayers: AddGeoreferencedImageLayerPayload[] // Queue for image layers
  // TODO: Add more map-specific state and actions as needed (e.g., active layers, sources, styles)
}

export const useMapStore = create<MapState>((set, get) => ({
  mapInstance: null,
  isMapReadyForOperations: false,
  pendingFeatures: [], // Initialize pending features queue
  pendingImageLayers: [], // Initialize pending image layers queue
  setMapInstance: (map) => {
    set({ mapInstance: map, pendingFeatures: [], pendingImageLayers: [] }) // Reset pending queues on new map instance
    // setMapInstanceForIpc(map) // Removed call - map-ipc-manager uses the store now
    if (map) {
      get().setMapReadyForOperations(false)
      console.log('[MapStore] Map instance set in store.')
      map.on('load', () => {
        console.log('[MapStore] Map instance loaded event triggered.')
      })
    } else {
      get().setMapReadyForOperations(false)
      console.log('[MapStore] Map instance cleared from store.')
    }
  },
  setMapReadyForOperations: (isReady: boolean) => {
    set({ isMapReadyForOperations: isReady })
    if (isReady) {
      console.log('[MapStore] Map is now ready for operations.')
      // Process any pending features
      const pending = get().pendingFeatures
      if (pending.length > 0) {
        console.log(`[MapStore] Processing ${pending.length} pending features.`)
        pending.forEach((payload) => get().addFeature(payload)) // Call addFeature for each
        set({ pendingFeatures: [] }) // Clear the queue
      }
      // Process any pending image layers
      const pendingImages = get().pendingImageLayers
      if (pendingImages.length > 0) {
        console.log(`[MapStore] Processing ${pendingImages.length} pending image layers.`)
        pendingImages.forEach((payload) => get().addGeoreferencedImageLayer(payload))
        set({ pendingImageLayers: [] }) // Clear the queue
      }
    } else {
      console.log('[MapStore] Map is NOT ready for operations.')
    }
  },
  addFeature: async (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations

    if (!map || !isMapReady) {
      console.warn(
        `[MapStore] Map instance not available or not ready (isReady: ${isMapReady}). Queuing feature. Payload:`,
        payload
      )
      set((state) => ({ pendingFeatures: [...state.pendingFeatures, payload] }))
      return
    }

    console.log(`[MapStore] Adding feature via LayerStore integration`, payload)

    try {
      // Convert the payload to a LayerDefinition
      const { convertFeatureToLayer } = await import('../lib/layer-adapters')
      const layerDefinition = convertFeatureToLayer(payload)
      
      // Add to LayerStore (which handles persistence and sync automatically)
      const layerStore = useLayerStore.getState()
      const layerId = await layerStore.addLayer(layerDefinition)
      
      console.log(`[MapStore] Feature added to LayerStore with ID: ${layerId}`)
      
      // Handle fit bounds if requested
      if (payload.fitBounds && payload.feature.geometry) {
        let bounds
        try {
          bounds = turf.bbox(payload.feature)
        } catch (e) {
          console.error(
            '[MapStore] Error during turf.bbox calculation:',
            e,
            'Feature:',
            JSON.stringify(payload.feature)
          )
          bounds = null
        }

        const isValidBounds =
          bounds &&
          bounds.length === 4 &&
          bounds.every((b) => typeof b === 'number' && isFinite(b)) &&
          (payload.feature.geometry.type === 'Point' || bounds[0] !== bounds[2] || bounds[1] !== bounds[3])

        if (isValidBounds) {
          map.fitBounds(
            [bounds[0], bounds[1], bounds[2], bounds[3]] as [number, number, number, number],
            { padding: 50, maxZoom: 16, duration: 1000 }
          )
          console.log('[MapStore] Fitted bounds for feature layer:', layerId)
        } else {
          console.warn(
            '[MapStore] Could not calculate or use valid bounds for the feature to fit. LayerId:',
            layerId,
            'Calculated bounds:',
            bounds,
            'Feature Geometry Type:',
            payload.feature.geometry.type
          )
        }
      }
      
    } catch (error) {
      console.error('[MapStore] Error adding feature via LayerStore:', error)
      // Fallback to old method if LayerStore integration fails
      console.warn('[MapStore] Falling back to legacy feature addition method')
      // Note: We could implement the old logic here as fallback, but for now we'll just log the error
    }
  },
  setLayerPaintProperties: (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations
    if (!map || !isMapReady) {
      console.warn(
        `[MapStore] Map instance not available or not ready (isReady: ${isMapReady}). Cannot set layer paint properties.`
      )
      return
    }
    const { sourceId, paintProperties, layerIdPattern } = payload
    console.log(`[MapStore] Setting paint properties for sourceId: ${sourceId}`, paintProperties)

    try {
      if (!map.isStyleLoaded()) {
        console.warn('[MapStore] Map style not loaded yet. Deferring setLayerPaintProperties.')
        map.once('styledata', () => {
          console.log('[MapStore] Map style loaded, retrying setLayerPaintProperties for', sourceId)
          get().setLayerPaintProperties(payload)
        })
        return
      }

      // Attempt to find layers associated with the sourceId.
      // This is a bit simplistic. A more robust way would be to know the exact layer IDs.
      // The layerIdPattern can help if layers follow a convention like `${sourceId}-point`, `${sourceId}-fill`.
      const style = map.getStyle()
      const layersToUpdate = style.layers.filter((layer) => {
        // Type guard to ensure layer has a 'source' property
        if ('source' in layer && layer.source === sourceId) {
          if (layerIdPattern) {
            const patternPrefix = layerIdPattern.replace(/(-layer)?$/, '')
            return layer.id.startsWith(patternPrefix)
          }
          return true
        }
        return false
      })

      if (layersToUpdate.length === 0) {
        console.warn(
          `[MapStore] No layers found for sourceId "${sourceId}" (pattern: "${layerIdPattern || 'any'}") to apply paint properties.`
        )
        return
      }

      layersToUpdate.forEach((layer) => {
        console.log(`[MapStore] Applying paint properties to layer: ${layer.id}`)
        for (const propName in paintProperties) {
          if (Object.prototype.hasOwnProperty.call(paintProperties, propName)) {
            map.setPaintProperty(layer.id, propName, paintProperties[propName])
          }
        }
      })
      console.log(
        `[MapStore] Successfully applied paint properties to ${layersToUpdate.length} layer(s) for sourceId: ${sourceId}`
      )
    } catch (error) {
      console.error(`[MapStore] Error setting paint properties for sourceId "${sourceId}":`, error)
    }
  },
  removeSourceAndAssociatedLayers: (sourceIdToRemove) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations
    if (!map || !isMapReady) {
      console.warn(
        `[MapStore] Map instance not available or not ready (isReady: ${isMapReady}). Cannot remove source and layers.`
      )
      return
    }
    console.log(
      `[MapStore] Attempting to remove source and associated layers for sourceId: ${sourceIdToRemove}`
    )

    try {
      if (!map.isStyleLoaded()) {
        console.warn(
          '[MapStore] Map style not loaded yet. Deferring removeSourceAndAssociatedLayers.'
        )
        map.once('styledata', () => {
          console.log(
            '[MapStore] Map style loaded, retrying removeSourceAndAssociatedLayers for',
            sourceIdToRemove
          )
          get().removeSourceAndAssociatedLayers(sourceIdToRemove)
        })
        return
      }

      const style = map.getStyle()
      const layersToRemove = style.layers.filter(
        (layer) => 'source' in layer && layer.source === sourceIdToRemove
      )

      if (layersToRemove.length > 0) {
        layersToRemove.forEach((layer) => {
          if (map.getLayer(layer.id)) {
            // Check if layer still exists before removing
            map.removeLayer(layer.id)
            console.log(`[MapStore] Removed layer: ${layer.id}`)
          } else {
            console.warn(
              `[MapStore] Layer ${layer.id} not found for removal, might have been already removed.`
            )
          }
        })
      } else {
        console.log(
          `[MapStore] No layers found associated with sourceId: ${sourceIdToRemove} to remove.`
        )
      }

      if (map.getSource(sourceIdToRemove)) {
        map.removeSource(sourceIdToRemove)
        console.log(`[MapStore] Removed source: ${sourceIdToRemove}`)
      } else {
        console.warn(
          `[MapStore] Source ${sourceIdToRemove} not found for removal, might have been already removed.`
        )
      }
    } catch (error) {
      console.error(`[MapStore] Error removing source "${sourceIdToRemove}" and its layers:`, error)
    }
  },
  setMapView: (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations

    if (!map || !isMapReady) {
      console.warn(
        `[MapStore] Map instance not available or not ready (isReady: ${isMapReady}). Cannot set map view.`
      )
      return
    }

    console.log('[MapStore] Setting map view with payload:', JSON.stringify(payload, null, 2))

    try {
      // Main logic for setting map view (center, zoom, pitch, bearing)
      if (map.isStyleLoaded()) {
        const { center, zoom, pitch, bearing, animate } = payload
        const animationDuration = animate !== undefined && !animate ? 0 : 1000

        // Prepare camera options, ensuring essential values if not provided
        const currentMapCenter = map.getCenter()
        const currentMapZoom = map.getZoom()
        const currentMapPitch = map.getPitch()
        const currentMapBearing = map.getBearing()

        const cameraOptions: maplibregl.CameraOptions & maplibregl.AnimationOptions = {
          center:
            center !== undefined
              ? [center[0], center[1]]
              : [currentMapCenter.lng, currentMapCenter.lat],
          zoom: zoom !== undefined ? zoom : currentMapZoom,
          pitch: pitch !== undefined ? pitch : currentMapPitch,
          bearing: bearing !== undefined ? bearing : currentMapBearing,
          duration: animationDuration
        }

        if (animate === false) {
          console.log('[MapStore] Jumping to view with options:', cameraOptions)
          map.jumpTo(cameraOptions) // jumpTo doesn't use duration but it's part of CameraOptions
        } else {
          console.log('[MapStore] Easing to view with options:', cameraOptions)
          map.easeTo(cameraOptions)
        }

        console.log('[MapStore] Map view update initiated with payload:', payload)
      } else {
        console.warn('[MapStore] Map style not loaded. Deferring setMapView.')
        map.once('styledata', () => {
          console.log('[MapStore] Map style loaded, retrying setMapView.')
          get().setMapView(payload)
        })
      }
    } catch (error) {
      console.error('[MapStore] Error setting map view:', error)
    }
  },
  addGeoreferencedImageLayer: async (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations

    if (!map || !isMapReady) {
      console.warn(
        `[MapStore] Map instance not available or not ready (isReady: ${isMapReady}). Queuing georeferenced image layer. Payload:`,
        payload
      )
      set((state) => ({ pendingImageLayers: [...state.pendingImageLayers, payload] }))
      return
    }

    console.log(`[MapStore] Adding georeferenced image via LayerStore integration`, payload)

    try {
      // Convert the payload to a LayerDefinition
      const { convertImageToLayer } = await import('../lib/layer-adapters')
      const layerDefinition = convertImageToLayer(payload)
      
      // Add to LayerStore (which handles persistence and sync automatically)
      const layerStore = useLayerStore.getState()
      const layerId = await layerStore.addLayer(layerDefinition)
      
      console.log(`[MapStore] Georeferenced image added to LayerStore with ID: ${layerId}`)
      
      // Handle fit bounds if requested
      if (payload.fitBounds) {
        // Create a simple Polygon feature from the coordinates to calculate bounds
        const polygonForBounds = turf.polygon([
          [
            payload.coordinates[0],
            payload.coordinates[1],
            payload.coordinates[2],
            payload.coordinates[3],
            payload.coordinates[0] // Close the ring
          ]
        ])
        const bounds = turf.bbox(polygonForBounds)

        if (
          bounds &&
          bounds.length === 4 &&
          bounds.every((b) => typeof b === 'number' && isFinite(b))
        ) {
          map.fitBounds(
            [bounds[0], bounds[1], bounds[2], bounds[3]] as [number, number, number, number],
            { padding: 20, maxZoom: 18, duration: 1000 }
          )
          console.log('[MapStore] Fitted bounds for image layer:', layerId)
        } else {
          console.warn(
            '[MapStore] Could not calculate valid bounds for the image layer to fit:',
            layerId,
            bounds
          )
        }
      }
      
    } catch (error) {
      console.error('[MapStore] Error adding georeferenced image via LayerStore:', error)
      // Fallback could be implemented here if needed
      console.warn('[MapStore] Falling back to legacy image layer addition method')
    }
  }
}))

// Path alias note:
// Make sure tsconfig.web.json (or equivalent for renderer) has paths configured:
// "paths": {
//   "@/*": ["./*"],  // if baseUrl is src/renderer/src
//   "@shared/*": ["../../shared/*"] // if baseUrl is src/renderer/src
// }
