import type {
  AddMapFeaturePayload,
  SetPaintPropertiesPayload,
  RemoveSourceAndLayersPayload,
  SetMapViewPayload,
  AddGeoreferencedImageLayerPayload
} from 'src/shared/ipc-types'
import { useMapStore } from '../../stores/map-store'

function handleAddFeatureToMapCallback(payload: AddMapFeaturePayload) {
  // Call the action on the Zustand store
  useMapStore.getState().addFeature(payload)
}

// + Callback for setting paint properties
function handleSetPaintPropertiesCallback(payload: SetPaintPropertiesPayload) {
  useMapStore.getState().setLayerPaintProperties(payload) // + Call new store action
}

// + Callback for removing source and layers
function handleRemoveSourceAndLayersCallback(payload: RemoveSourceAndLayersPayload) {
  useMapStore.getState().removeSourceAndAssociatedLayers(payload.sourceId) // + Call new store action
}

// + Callback for setting map view
function handleSetViewCallback(payload: SetMapViewPayload) {
  useMapStore.getState().setMapView(payload) // + Call new store action
}

// Callback for adding georeferenced image layer
function handleAddGeoreferencedImageLayerCallback(payload: AddGeoreferencedImageLayerPayload) {
  useMapStore.getState().addGeoreferencedImageLayer(payload)
}

let addFeatureCleanupListener: (() => void) | null = null
let setPaintCleanupListener: (() => void) | null = null // + Listener for paint properties
let removeSourceCleanupListener: (() => void) | null = null // + Listener for removing source
let setViewCleanupListener: (() => void) | null = null // + Listener for set view
let addGeoreferencedImageLayerCleanupListener: (() => void) | null = null // Listener for the new tool

/**
 * Initializes the IPC listeners for map-related events.
 * Should be called once when the application/map feature initializes.
 */
export function initializeMapIpcListeners(): void {
  if (
    addFeatureCleanupListener ||
    setPaintCleanupListener ||
    removeSourceCleanupListener ||
    setViewCleanupListener ||
    addGeoreferencedImageLayerCleanupListener
  ) {
    // + Check all listeners
    // To be more robust, one could re-register only if not already registered.
  }

  if (window.ctg?.map?.onAddFeature && !addFeatureCleanupListener) {
    addFeatureCleanupListener = window.ctg.map.onAddFeature(handleAddFeatureToMapCallback)
  } else if (!window.ctg?.map?.onAddFeature && !addFeatureCleanupListener) {
    void 0
  }

  // + Initialize listener for setPaintProperties
  if (window.ctg?.map?.onSetPaintProperties && !setPaintCleanupListener) {
    setPaintCleanupListener = window.ctg.map.onSetPaintProperties(handleSetPaintPropertiesCallback)
  } else if (!window.ctg?.map?.onSetPaintProperties && !setPaintCleanupListener) {
    void 0
  }

  // + Initialize listener for removeSourceAndLayers
  if (window.ctg?.map?.onRemoveSourceAndLayers && !removeSourceCleanupListener) {
    removeSourceCleanupListener = window.ctg.map.onRemoveSourceAndLayers(
      handleRemoveSourceAndLayersCallback
    )
  } else if (!window.ctg?.map?.onRemoveSourceAndLayers && !removeSourceCleanupListener) {
    void 0
  }

  // + Initialize listener for setView
  if (window.ctg?.map?.onSetView && !setViewCleanupListener) {
    setViewCleanupListener = window.ctg.map.onSetView(handleSetViewCallback)
  } else if (!window.ctg?.map?.onSetView && !setViewCleanupListener) {
    void 0
  }

  // Initialize listener for addGeoreferencedImageLayer
  if (window.ctg?.map?.onAddGeoreferencedImageLayer && !addGeoreferencedImageLayerCleanupListener) {
    addGeoreferencedImageLayerCleanupListener = window.ctg.map.onAddGeoreferencedImageLayer(
      handleAddGeoreferencedImageLayerCallback
    )
  } else if (
    !window.ctg?.map?.onAddGeoreferencedImageLayer &&
    !addGeoreferencedImageLayerCleanupListener
  ) {
    void 0
  }
}

/**
 * Cleans up the IPC listeners.
 * Should be called when the application/map feature unmounts or is destroyed.
 */
export function cleanupMapIpcListeners(): void {
  if (addFeatureCleanupListener) {
    addFeatureCleanupListener()
    addFeatureCleanupListener = null
  }
  // + Cleanup listener for setPaintProperties
  if (setPaintCleanupListener) {
    setPaintCleanupListener()
    setPaintCleanupListener = null
  }

  // + Cleanup listener for removeSourceAndLayers
  if (removeSourceCleanupListener) {
    removeSourceCleanupListener()
    removeSourceCleanupListener = null
  }

  // + Cleanup listener for setView
  if (setViewCleanupListener) {
    setViewCleanupListener()
    setViewCleanupListener = null
  }

  // Cleanup listener for addGeoreferencedImageLayer
  if (addGeoreferencedImageLayerCleanupListener) {
    addGeoreferencedImageLayerCleanupListener()
    addGeoreferencedImageLayerCleanupListener = null
  }
}

// The setMapInstanceForIpc function is no longer needed here, as the map.store.ts now calls it directly.
// Its export can be removed if it was only for this purpose.
// If it was removed from map.store.ts call, it should be kept here and map.store.ts should call it.
// Based on current map.store.ts, it IS called from there, so we can simplify this file.
