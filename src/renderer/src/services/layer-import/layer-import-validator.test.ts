import { describe, expect, it } from 'vitest'
import { LayerImportValidator } from './layer-import-validator'

describe('layer-import-validator', () => {
  it('detects GeoPackage files by extension when the browser does not provide a MIME type', () => {
    const file = new File(['dummy'], 'sample.gpkg', {
      type: '',
      lastModified: Date.now()
    })

    expect(LayerImportValidator.validateFile(file)).toEqual({
      valid: true,
      format: 'geopackage'
    })
  })

  it('recognizes the GeoPackage MIME type', () => {
    const file = new File(['dummy'], 'sample.bin', {
      type: 'application/geopackage+sqlite3',
      lastModified: Date.now()
    })

    expect(LayerImportValidator.validateFile(file)).toEqual({
      valid: true,
      format: 'geopackage'
    })
  })

  it('includes GeoPackage in the unsupported format error message', () => {
    const file = new File(['dummy'], 'sample.txt', {
      type: 'text/plain',
      lastModified: Date.now()
    })

    const result = LayerImportValidator.validateFile(file)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('GeoPackage')
  })
})
