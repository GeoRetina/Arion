import { useEffect } from 'react'
import { addProtocol } from 'maplibre-gl'
import { parseRasterRgbBandSelectionFromTileUrl } from '../../../../../shared/lib/raster-band-urls'
import type { RenderGeoTiffTileRequest } from '../../../../../shared/ipc-types'

const RASTER_PROTOCOL_SCHEME = 'arion-raster'
let rasterProtocolRegistered = false

export function useMapLibreRasterProtocol(): void {
  useEffect(() => {
    if (rasterProtocolRegistered) {
      return
    }

    addProtocol(RASTER_PROTOCOL_SCHEME, async (requestParameters, abortController) => {
      throwIfAborted(abortController)

      const tileRequest = parseRasterTileRequest(requestParameters.url)
      const tileData = await window.ctg.layers.renderGeoTiffTile(tileRequest)

      throwIfAborted(abortController)

      return {
        data: toArrayBuffer(tileData)
      }
    })

    rasterProtocolRegistered = true
  }, [])
}

function parseRasterTileRequest(urlString: string): RenderGeoTiffTileRequest {
  const url = new URL(urlString)
  if (url.protocol !== `${RASTER_PROTOCOL_SCHEME}:`) {
    throw new Error(`Unsupported raster protocol: ${url.protocol}`)
  }

  if (url.hostname !== 'tiles') {
    throw new Error('Unsupported raster protocol host')
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  if (pathParts.length !== 4) {
    throw new Error('Invalid raster tile path')
  }

  const [assetId, z, x, yWithExt] = pathParts
  const y = yWithExt.endsWith('.png') ? yWithExt.slice(0, -4) : yWithExt

  return {
    assetId,
    z: Number(z),
    x: Number(x),
    y: Number(y),
    rgbBands: parseRasterRgbBandSelectionFromTileUrl(urlString) ?? undefined
  }
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer
}

function throwIfAborted(abortController: AbortController): void {
  if (abortController.signal.aborted) {
    throw new Error('Raster tile request aborted')
  }
}

export const __testing = {
  parseRasterTileRequest,
  toArrayBuffer
}
