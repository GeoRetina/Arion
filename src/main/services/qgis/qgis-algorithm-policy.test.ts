import { describe, expect, it } from 'vitest'
import {
  evaluateQgisAlgorithmApproval,
  getQgisAlgorithmProviderId,
  isQgisAlgorithmApproved
} from './qgis-algorithm-policy'

describe('qgis-algorithm-policy', () => {
  it('allows all native provider algorithms', () => {
    expect(isQgisAlgorithmApproved('native:extractvertices')).toBe(true)
    expect(evaluateQgisAlgorithmApproval('native:setlayerstyle')).toMatchObject({
      allowed: true,
      providerId: 'native'
    })
  })

  it('allows only the vetted GDAL subset by default', () => {
    expect(isQgisAlgorithmApproved('gdal:translate')).toBe(true)
    expect(evaluateQgisAlgorithmApproval('gdal:polygonize')).toMatchObject({
      allowed: false,
      errorCode: 'UNSUPPORTED_ALGORITHM',
      providerId: 'gdal'
    })
  })

  it('rejects non-core providers when plugin algorithms are disabled', () => {
    expect(evaluateQgisAlgorithmApproval('saga:buffer')).toMatchObject({
      allowed: false,
      errorCode: 'DISALLOWED_PROVIDER',
      providerId: 'saga'
    })
  })

  it('parses provider ids safely', () => {
    expect(getQgisAlgorithmProviderId('native:buffer')).toBe('native')
    expect(getQgisAlgorithmProviderId('invalid')).toBeNull()
  })
})
