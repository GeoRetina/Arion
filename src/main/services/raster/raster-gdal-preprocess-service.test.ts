import { describe, expect, it } from 'vitest'
import { __testing, computeOverviewFactors } from './raster-gdal-preprocess-service'

describe('raster-gdal-preprocess-service', () => {
  it('computes overview factors for large rasters', () => {
    const factors = computeOverviewFactors(8192, 4096)
    expect(factors).toEqual([2, 4, 8, 16, 32])
  })

  it('returns no overviews for small rasters', () => {
    expect(computeOverviewFactors(200, 200)).toEqual([])
  })

  it('extracts EPSG from STAC metadata', () => {
    const epsg = __testing.extractEpsgCode({
      stac: {
        'proj:epsg': 3857
      }
    })
    expect(epsg).toBe(3857)
  })

  it('extracts EPSG from PROJJSON metadata', () => {
    const epsg = __testing.extractEpsgCode({
      coordinateSystem: {
        projjson: {
          id: {
            authority: 'EPSG',
            code: '4326'
          }
        }
      }
    })
    expect(epsg).toBe(4326)
  })

  it('extracts EPSG from WKT metadata', () => {
    const epsg = __testing.extractEpsgCode({
      coordinateSystem: {
        wkt: 'PROJCRS["WGS 84 / Pseudo-Mercator",ID["EPSG",3857]]'
      }
    })
    expect(epsg).toBe(3857)
  })
})
