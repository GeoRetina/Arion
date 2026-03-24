import { describe, expect, it } from 'vitest'
import {
  isQgisCompatibleLayerInputPath,
  isExternalLayerReference,
  resolveLocalLayerFilePath,
  resolveQgisLayerInputPath,
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
      expect(isExternalLayerReference('arion-vector://assets/asset.geojson')).toBe(true)
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

    it('falls back to managed source paths and absolute source data when needed', () => {
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
            options: {
              vectorSourcePath: 'C:\\data\\roads.gpkg'
            }
          }
        })
      ).toBe('C:\\data\\roads.gpkg')

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

  describe('resolveQgisLayerInputPath', () => {
    it('returns QGIS-ready paths for supported local vector and raster datasets', () => {
      expect(
        resolveQgisLayerInputPath({
          metadata: {
            context: {
              localFilePath: 'C:\\data\\roads.gpkg'
            }
          }
        })
      ).toBe('C:\\data\\roads.gpkg')

      expect(
        resolveQgisLayerInputPath({
          sourceConfig: {
            options: {
              rasterSourcePath: 'C:\\data\\elevation.tif'
            }
          }
        })
      ).toBe('C:\\data\\elevation.tif')
    })

    it('omits unsupported or non-local paths from QGIS-ready output', () => {
      expect(
        resolveQgisLayerInputPath({
          metadata: {
            context: {
              localFilePath: 'C:\\data\\overlay.png'
            }
          }
        })
      ).toBeNull()

      expect(
        resolveQgisLayerInputPath({
          metadata: {
            context: {
              localFilePath: 'relative\\roads.geojson'
            }
          }
        })
      ).toBeNull()
    })
  })

  describe('isQgisCompatibleLayerInputPath', () => {
    it('accepts supported absolute dataset paths and rejects unsupported ones', () => {
      expect(isQgisCompatibleLayerInputPath('C:\\data\\roads.geojson')).toBe(true)
      expect(isQgisCompatibleLayerInputPath('/tmp/roads.shp')).toBe(true)
      expect(isQgisCompatibleLayerInputPath('C:\\data\\overlay.png')).toBe(false)
      expect(isQgisCompatibleLayerInputPath('relative\\roads.geojson')).toBe(false)
    })
  })
})
