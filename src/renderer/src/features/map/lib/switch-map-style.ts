import type { StyleSpecification } from 'maplibre-gl'

export type StyleReadyTrigger = 'style.load' | 'idle'
type StyleReadyEventName = 'styledata' | 'style.load' | 'idle'

interface SwitchMapStyleCallbacks {
  onStyleData?: () => void
  onStyleLoad?: () => void
  onIdle?: () => void
  onReady?: (trigger: StyleReadyTrigger) => void
}

type SwitchableMap = {
  on: (event: StyleReadyEventName, listener: () => void) => unknown
  off: (event: StyleReadyEventName, listener: () => void) => unknown
  setStyle: (style: StyleSpecification) => unknown
  isStyleLoaded: () => boolean | void
}

export function switchMapStyle(
  map: SwitchableMap,
  style: StyleSpecification,
  callbacks: SwitchMapStyleCallbacks = {}
): () => void {
  let isResolved = false
  let didLogStyleData = false
  let didLogStyleLoad = false
  let didLogIdle = false

  const cleanup = (): void => {
    map.off('styledata', handleStyleData)
    map.off('style.load', handleStyleLoad)
    map.off('idle', handleIdle)
  }

  const markReady = (trigger: StyleReadyTrigger): void => {
    if (isResolved || !safeIsStyleLoaded(map)) {
      return
    }

    isResolved = true
    cleanup()
    callbacks.onReady?.(trigger)
  }

  const handleStyleData = (): void => {
    if (!didLogStyleData) {
      didLogStyleData = true
      callbacks.onStyleData?.()
    }
  }

  const handleStyleLoad = (): void => {
    if (!didLogStyleLoad) {
      didLogStyleLoad = true
      callbacks.onStyleLoad?.()
    }

    markReady('style.load')
  }

  const handleIdle = (): void => {
    if (!didLogIdle) {
      didLogIdle = true
      callbacks.onIdle?.()
    }

    markReady('idle')
  }

  map.on('styledata', handleStyleData)
  map.on('style.load', handleStyleLoad)
  map.on('idle', handleIdle)

  map.setStyle(style)

  return cleanup
}

function safeIsStyleLoaded(map: Pick<SwitchableMap, 'isStyleLoaded'>): boolean {
  try {
    return Boolean(map.isStyleLoaded())
  } catch {
    return false
  }
}
