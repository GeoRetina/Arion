import { describe, expect, it } from 'vitest'
import {
  convertFeatureToLayer,
  convertImageToLayer,
  isLegacyFeatureLayer,
  isLegacyImageLayer
} from './layer-adapters'
import type {
  AddGeoreferencedImageLayerPayload,
  AddMapFeaturePayload
} from '../../../shared/ipc-types'

describe('layer-adapters', () => {
  it('converts a feature payload into a vector layer definition', () => {
    const payload: AddMapFeaturePayload = {
      sourceId: 'custom-source',
      feature: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [12, 34]
        },
        properties: {
          name: 'Test Point',
          color: '#ff0000',
          opacity: 0.7,
          customTag: 'abc'
        }
      }
    }

    const layer = convertFeatureToLayer(payload)

    expect(layer.type).toBe('vector')
    expect(layer.sourceId).toBe('custom-source')
    expect(layer.name).toBe('Test Point')
    expect(layer.style.pointColor).toBe('#ff0000')
    expect(layer.metadata.tags).toContain('feature')
    expect(layer.metadata.geometryType).toBe('Point')
    expect(layer.metadata.attributes?.customTag).toEqual({
      type: 'string',
      nullable: false,
      description: 'Property: customTag'
    })
    expect(isLegacyFeatureLayer(layer)).toBe(true)
  })

  it('converts georeferenced image payload to raster layer definition', () => {
    const payload: AddGeoreferencedImageLayerPayload = {
      imageUrl: 'https://example.com/a.png',
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ],
      opacity: 0.6
    }

    const layer = convertImageToLayer(payload)
    const expectedBounds: [number, number, number, number] = [0, 0, 10, 10]

    expect(layer.type).toBe('raster')
    expect(layer.sourceConfig.type).toBe('image')
    expect(layer.sourceConfig.options?.bounds).toEqual(expectedBounds)
    expect(layer.opacity).toBe(0.6)
    expect(layer.metadata.tags).toContain('georeferenced')
    expect(layer.metadata.bounds).toEqual(expectedBounds)
    expect(isLegacyImageLayer(layer)).toBe(true)
  })
})
