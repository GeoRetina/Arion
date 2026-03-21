import { describe, expect, it } from 'vitest'
import { createLocalFileDescriptor } from '../shared/lib/local-file-descriptor'
import { LocalImportPathRegistry } from './local-import-path-registry'

describe('LocalImportPathRegistry', () => {
  it('resolves the most recently registered path for a descriptor', () => {
    const registry = new LocalImportPathRegistry()
    const descriptor = createLocalFileDescriptor({
      name: 'demo.tif',
      size: 1024,
      lastModified: 123,
      type: 'image/tiff'
    })

    registry.registerPath(descriptor, 'C:\\data\\first.tif', 1_000)
    registry.registerPath(descriptor, 'C:\\data\\second.tif', 2_000)

    expect(registry.resolvePath(descriptor, 2_000)).toBe('C:\\data\\second.tif')
  })

  it('prunes expired entries before resolving', () => {
    const registry = new LocalImportPathRegistry({ ttlMs: 100, maxKeys: 10 })
    const descriptor = createLocalFileDescriptor({
      name: 'demo.tif',
      size: 1024,
      lastModified: 123,
      type: 'image/tiff'
    })

    registry.registerPath(descriptor, 'C:\\data\\demo.tif', 1_000)

    expect(registry.resolvePath(descriptor, 1_050)).toBe('C:\\data\\demo.tif')
    expect(registry.resolvePath(descriptor, 1_101)).toBeNull()
  })

  it('evicts the oldest entries when the registry exceeds the size limit', () => {
    const registry = new LocalImportPathRegistry({ ttlMs: 10_000, maxKeys: 2 })
    const first = createLocalFileDescriptor({
      name: 'first.tif',
      size: 1,
      lastModified: 1,
      type: 'image/tiff'
    })
    const second = createLocalFileDescriptor({
      name: 'second.tif',
      size: 2,
      lastModified: 2,
      type: 'image/tiff'
    })
    const third = createLocalFileDescriptor({
      name: 'third.tif',
      size: 3,
      lastModified: 3,
      type: 'image/tiff'
    })

    registry.registerPath(first, 'C:\\data\\first.tif', 1_000)
    registry.registerPath(second, 'C:\\data\\second.tif', 2_000)
    registry.registerPath(third, 'C:\\data\\third.tif', 3_000)

    expect(registry.resolvePath(first, 3_000)).toBeNull()
    expect(registry.resolvePath(second, 3_000)).toBe('C:\\data\\second.tif')
    expect(registry.resolvePath(third, 3_000)).toBe('C:\\data\\third.tif')
  })
})
