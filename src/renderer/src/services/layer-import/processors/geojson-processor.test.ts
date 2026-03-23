import { describe, expect, it, vi } from 'vitest'
import { GeoJSONProcessor } from './geojson-processor'

const { resolveLocalImportFilePath } = vi.hoisted(() => ({
  resolveLocalImportFilePath: vi.fn()
}))

vi.mock('./local-import-file-path', () => ({
  resolveLocalImportFilePath
}))

describe('GeoJSONProcessor', () => {
  it('stores the local source path in layer metadata when the import file can be resolved', async () => {
    resolveLocalImportFilePath.mockResolvedValue('C:\\data\\roads.geojson')

    const file = {
      text: vi.fn(async () =>
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [0, 0],
                  [1, 1]
                ]
              },
              properties: {
                name: 'Main St'
              }
            }
          ]
        })
      )
    } as unknown as File

    const layer = await GeoJSONProcessor.processFile(file, 'roads.geojson')

    expect(layer.metadata.context).toMatchObject({
      localFilePath: 'C:\\data\\roads.geojson'
    })
  })
})
