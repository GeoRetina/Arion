import { describe, expect, it } from 'vitest'
import {
  isExternalLayerReference,
  resolveLocalLayerFilePath,
  trimToNonEmptyString
} from './layer-source-paths'

describe('layer-source-paths', () => {
  describe('trimToNonEmptyString', () => {
    it('returns trimmed strings and rejects empty values', () => {
      expect(trimToNonEmptyString('  hello  ')).toBe('hello')
      expect(trimToNonEmptyString('   ')).toBeNull()
      expect(trimToNonEmptyString(42)).toBeNull()
    })
  })

  describe('isExternalLayerReference', () => {
    it('treats remote and in-memory schemes as external', () => {
      expect(isExternalLayerReference('https://example.com/tiles')).toBe(true)
      expect(isExternalLayerReference('blob:abc123')).toBe(true)
      expect(isExternalLayerReference('data:image/png;base64,abc')).toBe(true)
      expect(isExternalLayerReference('arion-raster://tiles/asset/{z}/{x}/{y}.png')).toBe(true)
      expect(isExternalLayerReference('arion-raster:tiles/asset')).toBe(true)
    })

    it('does not treat local filesystem paths as external', () => {
      expect(isExternalLayerReference('C:\\data\\elevation.tif')).toBe(false)
      expect(isExternalLayerReference('/tmp/elevation.tif')).toBe(false)
    })
  })

  describe('resolveLocalLayerFilePath', () => {
    it('prefers explicit local file context over other layer source paths', () => {
      expect(
        resolveLocalLayerFilePath({
          metadata: {
            context: {
              localFilePath: 'C:\\data\\roads.geojson'
            }
          },
          sourceConfig: {
            data: 'C:\\data\\fallback.geojson',
            options: {
              rasterSourcePath: 'C:\\data\\fallback.tif'
            }
          }
        })
      ).toBe('C:\\data\\roads.geojson')
    })

    it('falls back to rasterSourcePath and absolute source data when needed', () => {
      expect(
        resolveLocalLayerFilePath({
          sourceConfig: {
            options: {
              rasterSourcePath: 'relative\\elevation.tif'
            }
          }
        })
      ).toBe('relative\\elevation.tif')

      expect(
        resolveLocalLayerFilePath({
          sourceConfig: {
            data: 'C:\\data\\overlay.png'
          }
        })
      ).toBe('C:\\data\\overlay.png')
    })

    it('ignores external and non-path source data', () => {
      expect(
        resolveLocalLayerFilePath({
          sourceConfig: {
            data: 'https://example.com/overlay.png'
          }
        })
      ).toBeNull()

      expect(
        resolveLocalLayerFilePath({
          sourceConfig: {
            data: {
              type: 'FeatureCollection',
              features: []
            }
          }
        })
      ).toBeNull()
    })
  })
})
