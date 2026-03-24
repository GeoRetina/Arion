import { describe, expect, it } from 'vitest'
import { selectQgisArtifactsForImport } from './qgis-import-selection'

describe('selectQgisArtifactsForImport', () => {
  it('selects all importable map artifacts when auto import has no explicit subset', () => {
    const result = selectQgisArtifactsForImport({
      importPreference: 'auto',
      artifacts: [
        {
          path: 'E:\\outputs\\primary.geojson',
          kind: 'vector',
          exists: true
        },
        {
          path: 'E:\\outputs\\surface.tif',
          kind: 'raster',
          exists: true
        },
        {
          path: 'E:\\outputs\\style.qml',
          kind: 'style',
          exists: true
        }
      ]
    })

    expect(result.artifacts).toEqual([
      {
        path: 'E:\\outputs\\primary.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true
      },
      {
        path: 'E:\\outputs\\surface.tif',
        kind: 'raster',
        exists: true,
        selectedForImport: true
      },
      {
        path: 'E:\\outputs\\style.qml',
        kind: 'style',
        exists: true,
        selectedForImport: false
      }
    ])
    expect(result.artifactsToImport).toEqual([
      {
        path: 'E:\\outputs\\primary.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true
      },
      {
        path: 'E:\\outputs\\surface.tif',
        kind: 'raster',
        exists: true,
        selectedForImport: true
      }
    ])
  })

  it('limits imports to the explicitly requested output paths', () => {
    const result = selectQgisArtifactsForImport({
      importPreference: 'auto',
      outputsToImport: ['e:/outputs/top_10.geojson'],
      artifacts: [
        {
          path: 'E:\\outputs\\top_10.geojson',
          kind: 'vector',
          exists: true
        },
        {
          path: 'E:\\outputs\\non_top10.geojson',
          kind: 'vector',
          exists: true
        }
      ]
    })

    expect(result.artifacts).toEqual([
      {
        path: 'E:\\outputs\\top_10.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true
      },
      {
        path: 'E:\\outputs\\non_top10.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: false
      }
    ])
    expect(result.artifactsToImport).toEqual([
      {
        path: 'E:\\outputs\\top_10.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: true
      }
    ])
  })

  it('marks artifacts as not selected when import is not automatic', () => {
    const result = selectQgisArtifactsForImport({
      importPreference: 'suggest',
      outputsToImport: ['E:\\outputs\\top_10.geojson'],
      artifacts: [
        {
          path: 'E:\\outputs\\top_10.geojson',
          kind: 'vector',
          exists: true
        }
      ]
    })

    expect(result.artifacts).toEqual([
      {
        path: 'E:\\outputs\\top_10.geojson',
        kind: 'vector',
        exists: true,
        selectedForImport: false
      }
    ])
    expect(result.artifactsToImport).toEqual([])
  })
})
