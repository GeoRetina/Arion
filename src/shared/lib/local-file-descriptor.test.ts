import { describe, expect, it } from 'vitest'
import { createLocalFileDescriptor, getLocalFileDescriptorKey } from './local-file-descriptor'

describe('local-file-descriptor helpers', () => {
  it('normalizes missing MIME types to an empty string', () => {
    expect(
      createLocalFileDescriptor({
        name: 'demo.tif',
        size: 123,
        lastModified: 456
      })
    ).toEqual({
      name: 'demo.tif',
      size: 123,
      lastModified: 456,
      type: ''
    })
  })

  it('builds stable keys from file metadata', () => {
    const descriptor = createLocalFileDescriptor({
      name: 'demo.tif',
      size: 1024,
      lastModified: 123456789,
      type: 'image/tiff'
    })

    expect(getLocalFileDescriptorKey(descriptor)).toBe(
      JSON.stringify(['demo.tif', 1024, 123456789, 'image/tiff'])
    )
  })
})
