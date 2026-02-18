import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkGoogleEarthEngine, checkPmtiles, checkStac } from './http-checkers'

describe('http integration checkers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts valid STAC payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          stac_version: '1.0.0',
          type: 'Catalog',
          links: [{ rel: 'root', href: 'https://example.com/stac' }]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    )

    const result = await checkStac({
      baseUrl: 'https://example.com/stac',
      timeoutMs: 2000
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('connected')
  })

  it('rejects non-stac payloads that only have generic links arrays', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          links: [{ href: 'https://example.com/not-stac' }]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    )

    const result = await checkStac({
      baseUrl: 'https://example.com/not-stac',
      timeoutMs: 2000
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('does not appear to be a STAC')
  })

  it('accepts PMTiles archives with PMTiles magic header', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]), {
          status: 200
        })
      )

    const result = await checkPmtiles({
      url: 'https://example.com/map.pmtiles',
      timeoutMs: 2000
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('connected')
  })

  it('rejects weak PM-only signatures', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x50, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), {
          status: 200
        })
      )

    const result = await checkPmtiles({
      url: 'https://example.com/not-pmtiles.bin',
      timeoutMs: 2000
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('not a PMTiles')
  })

  it('fails GEE checks when service account credentials are not provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await checkGoogleEarthEngine({
      projectId: 'my-project',
      serviceAccountJson: ''
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('requires a service account JSON credential')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
