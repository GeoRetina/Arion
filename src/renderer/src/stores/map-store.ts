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

  // Session Management
  clearSessionData: () => void
  resetPendingQueues: () => void

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
      map.on('load', () => {})
    } else {
      get().setMapReadyForOperations(false)
    }
  },
  setMapReadyForOperations: (isReady: boolean) => {
    set({ isMapReadyForOperations: isReady })
    if (isReady) {
      // Process any pending features
      const pending = get().pendingFeatures
      if (pending.length > 0) {
        pending.forEach((payload) => get().addFeature(payload)) // Call addFeature for each
        set({ pendingFeatures: [] }) // Clear the queue
      }
      // Process any pending image layers
      const pendingImages = get().pendingImageLayers
      if (pendingImages.length > 0) {
        pendingImages.forEach((payload) => get().addGeoreferencedImageLayer(payload))
        set({ pendingImageLayers: [] }) // Clear the queue
      }
    } else {
    }
  },
  addFeature: async (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations

    if (!map || !isMapReady) {
      set((state) => ({ pendingFeatures: [...state.pendingFeatures, payload] }))
      return
    }

    try {
      // Convert the payload to a LayerDefinition
      const { convertFeatureToLayer } = await import('../lib/layer-adapters')
      const layerDefinition = convertFeatureToLayer(payload)

      // Add to LayerStore (which handles persistence and sync automatically)
      const layerStore = useLayerStore.getState()
      const layerId = await layerStore.addLayer(layerDefinition)

      // Handle fit bounds if requested
      if (payload.fitBounds && payload.feature.geometry) {
        let bounds
        try {
          bounds = turf.bbox(payload.feature)
        } catch (e) {
          bounds = null
        }

        const isValidBounds =
          bounds &&
          bounds.length === 4 &&
          bounds.every((b) => typeof b === 'number' && isFinite(b)) &&
          (payload.feature.geometry.type === 'Point' ||
            bounds[0] !== bounds[2] ||
            bounds[1] !== bounds[3])

        if (isValidBounds) {
          map.fitBounds(
            [bounds[0], bounds[1], bounds[2], bounds[3]] as [number, number, number, number],
            { padding: 50, maxZoom: 16, duration: 1000 }
          )
        } else {
        }
      }
    } catch (error) {
      // Fallback to old method if LayerStore integration fails
      // Note: We could implement the old logic here as fallback, but for now we'll just log the error
    }
  },
  setLayerPaintProperties: (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations
    if (!map || !isMapReady) {
      return
    }
    const { sourceId, paintProperties, layerIdPattern } = payload

    try {
      if (!map.isStyleLoaded()) {
        map.once('styledata', () => {
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
        return
      }

      layersToUpdate.forEach((layer) => {
        for (const propName in paintProperties) {
          if (Object.prototype.hasOwnProperty.call(paintProperties, propName)) {
            map.setPaintProperty(layer.id, propName, paintProperties[propName])
          }
        }
      })
    } catch (error) {}
  },
  removeSourceAndAssociatedLayers: (sourceIdToRemove) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations
    if (!map || !isMapReady) {
      return
    }

    try {
      if (!map.isStyleLoaded()) {
        map.once('styledata', () => {
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
          } else {
          }
        })
      } else {
      }

      if (map.getSource(sourceIdToRemove)) {
        map.removeSource(sourceIdToRemove)
      } else {
      }
    } catch (error) {}
  },
  setMapView: (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations

    if (!map || !isMapReady) {
      return
    }

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
          map.jumpTo(cameraOptions) // jumpTo doesn't use duration but it's part of CameraOptions
        } else {
          map.easeTo(cameraOptions)
        }
      } else {
        map.once('styledata', () => {
          get().setMapView(payload)
        })
      }
    } catch (error) {}
  },
  addGeoreferencedImageLayer: async (payload) => {
    const map = get().mapInstance
    const isMapReady = get().isMapReadyForOperations

    if (!map || !isMapReady) {
      set((state) => ({ pendingImageLayers: [...state.pendingImageLayers, payload] }))
      return
    }

    try {
      // Convert the payload to a LayerDefinition
      const { convertImageToLayer } = await import('../lib/layer-adapters')
      const layerDefinition = convertImageToLayer(payload)

      // Add to LayerStore (which handles persistence and sync automatically)
      const layerStore = useLayerStore.getState()
      const layerId = await layerStore.addLayer(layerDefinition)

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
        } else {
        }
      }
    } catch (error) {
      // Fallback could be implemented here if needed
    }
  },

  // Session Management
  clearSessionData: () => {
    set({
      pendingFeatures: [],
      pendingImageLayers: []
    })
  },

  resetPendingQueues: () => {
    set({
      pendingFeatures: [],
      pendingImageLayers: []
    })
  }
}))

// Path alias note:
// Make sure tsconfig.web.json (or equivalent for renderer) has paths configured:
// "paths": {
//   "@/*": ["./*"],  // if baseUrl is src/renderer/src
//   "@shared/*": ["../../shared/*"] // if baseUrl is src/renderer/src
// }
