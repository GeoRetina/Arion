import { useState, useEffect } from 'react'
import type { SetMapSidebarVisibilityPayload } from '../../../../../shared/ipc-types'

export const useMapSidebar = (): {
  isMapSidebarExpanded: boolean
  toggleMapSidebar: () => void
} => {
  const [isMapSidebarExpanded, setIsMapSidebarExpanded] = useState(false)

  const toggleMapSidebar = (): void => {
    setIsMapSidebarExpanded(!isMapSidebarExpanded)
  }

  // Effect to handle map sidebar visibility commands from main process
  useEffect(() => {
    if (window.ctg?.ui?.onSetMapSidebarVisibility) {
      const unsubscribe = window.ctg.ui.onSetMapSidebarVisibility(
        (payload: SetMapSidebarVisibilityPayload) => {
          setIsMapSidebarExpanded(payload.visible)
        }
      )
      return () => unsubscribe()
    } else {
      return undefined
    }
  }, [setIsMapSidebarExpanded])

  return {
    isMapSidebarExpanded,
    toggleMapSidebar
  }
}
