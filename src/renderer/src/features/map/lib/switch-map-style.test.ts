import { describe, expect, it, vi } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { switchMapStyle } from './switch-map-style'

type MapEventName = 'styledata' | 'style.load' | 'idle'

class MockSwitchableMap {
  private listeners = new Map<MapEventName, Set<() => void>>()
  private styleLoaded = false

  on(event: MapEventName, listener: () => void): this {
    const listeners = this.listeners.get(event) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  off(event: MapEventName, listener: () => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  setStyle(style: StyleSpecification): this {
    void style
    return this
  }

  isStyleLoaded(): boolean {
    return this.styleLoaded
  }

  setStyleLoaded(isLoaded: boolean): void {
    this.styleLoaded = isLoaded
  }

  emit(event: MapEventName): void {
    const listeners = Array.from(this.listeners.get(event) ?? [])
    listeners.forEach((listener) => listener())
  }

  listenerCount(event: MapEventName): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

const style = {
  version: 8,
  sources: {},
  layers: []
} satisfies StyleSpecification

describe('switchMapStyle', () => {
  it('waits for idle when style.load never fires', () => {
    const map = new MockSwitchableMap()
    const onStyleData = vi.fn()
    const onIdle = vi.fn()
    const onReady = vi.fn()

    switchMapStyle(map, style, {
      onStyleData,
      onIdle,
      onReady
    })

    map.emit('styledata')

    expect(onStyleData).toHaveBeenCalledTimes(1)
    expect(onReady).not.toHaveBeenCalled()

    map.setStyleLoaded(true)
    map.emit('idle')

    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenCalledWith('idle')
    expect(map.listenerCount('styledata')).toBe(0)
    expect(map.listenerCount('style.load')).toBe(0)
    expect(map.listenerCount('idle')).toBe(0)
  })

  it('uses style.load when that event reports a ready style', () => {
    const map = new MockSwitchableMap()
    const onStyleLoad = vi.fn()
    const onReady = vi.fn()

    switchMapStyle(map, style, {
      onStyleLoad,
      onReady
    })

    map.setStyleLoaded(true)
    map.emit('style.load')

    expect(onStyleLoad).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenCalledWith('style.load')
  })

  it('does not resolve readiness from styledata alone', () => {
    const map = new MockSwitchableMap()
    const onReady = vi.fn()

    switchMapStyle(map, style, {
      onReady
    })

    map.setStyleLoaded(true)
    map.emit('styledata')

    expect(onReady).not.toHaveBeenCalled()
    expect(map.listenerCount('styledata')).toBe(1)
    expect(map.listenerCount('style.load')).toBe(1)
    expect(map.listenerCount('idle')).toBe(1)
  })
})
