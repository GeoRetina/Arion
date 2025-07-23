import { create } from 'zustand'
import type { Map } from 'maplibre-gl'
// import type { Feature, Geometry } from 'geojson' // Removed as potentially unused directly
import * as turf from '@turf/turf'
// import { setMapInstanceForIpc } from '../lib/ipc/map-ipc-manager' // Removed import
import type {
  AddMapFeaturePayload,
  SetPaintPropertiesPayload,
  SetMapViewPayload,
  AddGeoreferencedImageLayerPayload
} from '../../../shared/ipc-types' // Relative path - ensure this or your preferred alias works

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
  addFeature: (payload) => {
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

    const { feature, sourceId: newSourceIdFromPayload, fitBounds } = payload
    const sourceId = newSourceIdFromPayload || `llm-feature-${Date.now()}`

    console.log(`[MapStore] Attempting to add/update feature with sourceId: ${sourceId}`, feature)

    try {
      // Ensure map is ready for source/layer operations (sometimes needed if called too early)
      if (!map.isStyleLoaded()) {
        console.warn(
          '[MapStore] Map style not loaded yet. Deferring addFeature or listen for style.load event.'
        )
        // Optionally, queue this action or listen for 'styledata' or 'load' event
        map.once('styledata', () => {
          console.log('[MapStore] Map style loaded, retrying addFeature for', sourceId)
          get().addFeature(payload) // Retry the operation
        })
        return
      }

      const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource
      if (existingSource) {
        console.log(`[MapStore] Updating existing source: ${sourceId}`)
        existingSource.setData(feature as any) // Type assertion for GeoJSON data
      } else {
        console.log(`[MapStore] Adding new source: ${sourceId}`)
        map.addSource(sourceId, {
          type: 'geojson',
          data: feature as any // Type assertion for GeoJSON data
        })

        // Add a generic layer for the new source based on geometry type
        const layerIdBase = `${sourceId}-layer`
        let layerAdded = false

        if (feature.geometry.type === 'Point' || feature.geometry.type === 'MultiPoint') {
          if (!map.getLayer(`${layerIdBase}-point`)) {
            map.addLayer({
              id: `${layerIdBase}-point`,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': feature.properties?.radius || 7,
                'circle-color': feature.properties?.color || '#FF4500',
                'circle-stroke-width':
                  feature.properties?.strokeWidth !== undefined
                    ? feature.properties.strokeWidth
                    : 1.5,
                'circle-stroke-color': feature.properties?.strokeColor || '#FFFFFF',
                'circle-opacity': feature.properties?.opacity || 0.9
              }
            })
            layerAdded = true
          }
        } else if (
          feature.geometry.type === 'LineString' ||
          feature.geometry.type === 'MultiLineString'
        ) {
          if (!map.getLayer(`${layerIdBase}-line`)) {
            map.addLayer({
              id: `${layerIdBase}-line`,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': feature.properties?.color || '#1E90FF',
                'line-width': feature.properties?.width || 3,
                'line-opacity': feature.properties?.opacity || 0.9
              }
            })
            layerAdded = true
          }
        } else if (
          feature.geometry.type === 'Polygon' ||
          feature.geometry.type === 'MultiPolygon'
        ) {
          if (!map.getLayer(`${layerIdBase}-fill`)) {
            map.addLayer({
              id: `${layerIdBase}-fill`,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': feature.properties?.fillColor || '#32CD32',
                'fill-opacity': feature.properties?.fillOpacity || 0.6,
                'fill-outline-color': feature.properties?.outlineColor || '#000000'
              }
            })
            layerAdded = true
          }
        }
        if (layerAdded) {
          console.log('[MapStore] Added new layer for source:', sourceId)
        } else if (!existingSource) {
          // If it wasn't an existing source and no layer was added (e.g. duplicate layer ID check failed)
          console.warn(
            '[MapStore] New source added but corresponding layer might already exist or geometry type not handled:',
            sourceId,
            feature.geometry.type
          )
        }
      }

      if (fitBounds && feature.geometry) {
        let bounds
        try {
          bounds = turf.bbox(feature)
        } catch (e) {
          console.error(
            '[MapStore] Error during turf.bbox calculation:',
            e,
            'Feature:',
            JSON.stringify(feature)
          )
          bounds = null
        }

        const isValidBounds =
          bounds &&
          bounds.length === 4 &&
          bounds.every((b) => typeof b === 'number' && isFinite(b)) &&
          (feature.geometry.type === 'Point' || bounds[0] !== bounds[2] || bounds[1] !== bounds[3])

        if (isValidBounds) {
          map.fitBounds(
            [bounds[0], bounds[1], bounds[2], bounds[3]] as [number, number, number, number],
            { padding: 50, maxZoom: 16, duration: 1000 }
          )
          console.log('[MapStore] Fitted bounds for feature:', sourceId)
        } else {
          console.warn(
            '[MapStore] Could not calculate or use valid bounds for the feature to fit. SourceId:',
            sourceId,
            'Calculated bounds:',
            bounds,
            'Feature Geometry Type:',
            feature.geometry.type
          )
        }
      } else {
        if (!fitBounds) {
          console.log(
            '[MapStore] fitBounds flag is false. Skipping bounds fitting for sourceId:',
            sourceId
          )
        }
        if (!feature.geometry) {
          console.warn(
            '[MapStore] feature.geometry is missing. Cannot fit bounds for sourceId:',
            sourceId
          )
        }
      }
    } catch (error) {
      console.error(
        `[MapStore] Error adding/updating feature on map (sourceId: ${sourceId}):`,
        error
      )
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
  addGeoreferencedImageLayer: (payload) => {
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

    const {
      imageUrl,
      coordinates,
      sourceId: newSourceId,
      layerId: newLayerId,
      fitBounds,
      opacity
    } = payload
    const sourceId = newSourceId || `image-source-${Date.now()}`
    const layerId = newLayerId || `image-layer-${Date.now()}`

    console.log(
      `[MapStore] Attempting to add georeferenced image layer with sourceId: ${sourceId}, layerId: ${layerId}`,
      payload
    )

    try {
      if (!map.isStyleLoaded()) {
        console.warn('[MapStore] Map style not loaded yet. Deferring addGeoreferencedImageLayer.')
        map.once('styledata', () => {
          console.log(
            '[MapStore] Map style loaded, retrying addGeoreferencedImageLayer for',
            sourceId
          )
          get().addGeoreferencedImageLayer(payload) // Retry the operation
        })
        return
      }

      // Remove existing source and layer if they exist with the same IDs to prevent errors
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
        console.log(`[MapStore] Removed existing layer: ${layerId}`)
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
        console.log(`[MapStore] Removed existing source: ${sourceId}`)
      }

      map.addSource(sourceId, {
        type: 'image',
        url: imageUrl,
        coordinates: [
          coordinates[0] as [number, number], // Top-left
          coordinates[1] as [number, number], // Top-right
          coordinates[2] as [number, number], // Bottom-right
          coordinates[3] as [number, number] // Bottom-left
        ]
      })
      console.log(`[MapStore] Added image source: ${sourceId} with URL: ${imageUrl}`)

      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': opacity !== undefined ? opacity : 1
        }
      })
      console.log(`[MapStore] Added raster layer: ${layerId} for source: ${sourceId}`)

      if (fitBounds) {
        // Create a simple Polygon feature from the coordinates to calculate bounds
        // The coordinates are [TL, TR, BR, BL], turf.bbox needs them as a polygon ring.
        const polygonForBounds = turf.polygon([
          [
            coordinates[0],
            coordinates[1],
            coordinates[2],
            coordinates[3],
            coordinates[0] // Close the ring
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
      console.error(
        `[MapStore] Error adding georeferenced image layer (sourceId: ${sourceId}):`,
        error
      )
    }
  }
}))

// Path alias note:
// Make sure tsconfig.web.json (or equivalent for renderer) has paths configured:
// "paths": {
//   "@/*": ["./*"],  // if baseUrl is src/renderer/src
//   "@shared/*": ["../../shared/*"] // if baseUrl is src/renderer/src
// }
