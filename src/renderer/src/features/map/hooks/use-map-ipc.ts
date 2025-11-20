import { useEffect } from 'react'
import { cleanupMapIpcListeners, initializeMapIpcListeners } from '../../../lib/ipc/map-ipc-manager'

/**
 * Sets up IPC listeners for map events and tears them down on unmount.
 */
export function useMapIpc() {
  useEffect(() => {
    initializeMapIpcListeners()

    return () => {
      cleanupMapIpcListeners()
    }
  }, [])
}
