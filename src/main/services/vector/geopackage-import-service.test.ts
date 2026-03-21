import { promises as fs } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GdalRunnerService } from '../raster/gdal-runner-service'

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/mock/app'
  }
}))

import { GeoPackageImportService } from './geopackage-import-service'

describe('geopackage-import-service', () => {
  const cleanupPaths: string[] = []

  afterEach(async () => {
    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop()
      if (!path) {
        continue
      }

      await fs.rm(path, { recursive: true, force: true })
    }
  })

  it('imports a single vector layer and skips non-vector tables', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arion-gpkg-import-test-'))
    cleanupPaths.push(root)
    const sourcePath = join(root, 'sample.gpkg')
    await fs.writeFile(sourcePath, 'dummy')

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (tool: string) => {
        if (tool === 'ogrinfo') {
          return {
            command: tool,
            args: [],
            stdout: JSON.stringify({
              layers: [
                {
                  name: 'roads',
                  featureCount: 2,
                  geometryFields: [{ type: 'Line String' }]
                },
                {
                  name: 'gpkg_contents',
                  featureCount: 1,
                  geometryFields: []
                }
              ]
            }),
            stderr: '',
            durationMs: 1
          }
        }

        return {
          command: tool,
          args: [],
          stdout: JSON.stringify({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Main St' },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-79.4, 43.7],
                    [-79.3, 43.71]
                  ]
                }
              }
            ]
          }),
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new GeoPackageImportService(fakeRunner)
    const result = await service.importFile(sourcePath)

    expect(result.layerCount).toBe(1)
    expect(result.featureCount).toBe(1)
    expect(result.sourceLayers).toEqual([
      {
        name: 'roads',
        featureCount: 2,
        geometryType: 'Line String',
        crs: 'EPSG:4326'
      }
    ])
    expect(result.warnings).toContain('Skipped 1 non-vector GeoPackage layer')
    expect(result.mergedLayerPropertyName).toBeUndefined()
  })

  it('merges multiple vector layers and preserves the source layer name on features', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arion-gpkg-import-test-'))
    cleanupPaths.push(root)
    const sourcePath = join(root, 'multi-layer.gpkg')
    await fs.writeFile(sourcePath, 'dummy')

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async (tool: string, args: string[]) => {
        if (tool === 'ogrinfo') {
          return {
            command: tool,
            args,
            stdout: JSON.stringify({
              layers: [
                {
                  name: 'roads',
                  featureCount: 1,
                  geometryFields: [{ type: 'Line String' }]
                },
                {
                  name: 'buildings',
                  featureCount: 1,
                  geometryFields: [{ type: 'Polygon' }]
                }
              ]
            }),
            stderr: '',
            durationMs: 1
          }
        }

        const layerName = args.at(-1)
        return {
          command: tool,
          args,
          stdout: JSON.stringify({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties:
                  layerName === 'roads'
                    ? { class: 'primary' }
                    : { __gpkg_layer: 'existing-value', class: 'residential' },
                geometry:
                  layerName === 'roads'
                    ? {
                        type: 'LineString',
                        coordinates: [
                          [-79.4, 43.7],
                          [-79.3, 43.71]
                        ]
                      }
                    : {
                        type: 'Polygon',
                        coordinates: [
                          [
                            [-79.41, 43.7],
                            [-79.4, 43.7],
                            [-79.4, 43.71],
                            [-79.41, 43.7]
                          ]
                        ]
                      }
              }
            ]
          }),
          stderr: '',
          durationMs: 1
        }
      }
    } as unknown as GdalRunnerService

    const service = new GeoPackageImportService(fakeRunner)
    const result = await service.importFile(sourcePath)

    expect(result.layerCount).toBe(2)
    expect(result.featureCount).toBe(2)
    expect(result.mergedLayerPropertyName).toBe('__gpkg_layer_1')
    expect(result.geojson.features[0].properties).toMatchObject({
      __gpkg_layer_1: 'roads'
    })
    expect(result.geojson.features[1].properties).toMatchObject({
      __gpkg_layer: 'existing-value',
      __gpkg_layer_1: 'buildings'
    })
    expect(result.warnings).toContain('Merged 2 GeoPackage layers into a single import')
  })

  it('fails when the GeoPackage has no vector layers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arion-gpkg-import-test-'))
    cleanupPaths.push(root)
    const sourcePath = join(root, 'tiles-only.gpkg')
    await fs.writeFile(sourcePath, 'dummy')

    const fakeRunner = {
      getAvailability: async () => ({
        available: true,
        runtimePaths: {
          binDirectory: '/mock/bin',
          gdalDataDirectory: '/mock/share/gdal',
          projDirectory: '/mock/share/proj',
          gdalPluginsDirectory: null
        }
      }),
      run: async () => ({
        command: 'ogrinfo',
        args: [],
        stdout: JSON.stringify({
          layers: [
            {
              name: 'tiles',
              featureCount: 1,
              geometryFields: []
            }
          ]
        }),
        stderr: '',
        durationMs: 1
      })
    } as unknown as GdalRunnerService

    const service = new GeoPackageImportService(fakeRunner)

    await expect(service.importFile(sourcePath)).rejects.toThrow(
      'GeoPackage does not contain any vector layers'
    )
  })
})
