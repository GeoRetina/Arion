import { protocol, type Session } from 'electron'
import { z } from 'zod'
import { getRasterTileService, type RasterTileService } from './raster-tile-service'

export const RASTER_PROTOCOL_SCHEME = 'arion-raster'

const tilePathSchema = z.object({
  assetId: z.string().uuid(),
  z: z.coerce.number().int().min(0).max(30),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0)
})

let protocolRegistered = false

export function registerRasterProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RASTER_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export function registerRasterTileProtocol(
  session: Session,
  rasterTileService: RasterTileService = getRasterTileService()
): void {
  if (protocolRegistered) {
    return
  }

  session.protocol.handle(RASTER_PROTOCOL_SCHEME, async (request) => {
    try {
      const tileRequest = parseTileRequest(request)
      const tileBuffer = await rasterTileService.renderTile(tileRequest)
      const responseBody = new Uint8Array(tileBuffer)

      return new Response(responseBody, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400'
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to render raster tile'
      const status = /not found|enoent|no such file/i.test(message) ? 404 : 400
      console.error(`Raster tile request failed (${request.url}): ${message}`)

      return new Response(message, {
        status,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store'
        }
      })
    }
  })

  protocolRegistered = true
}

function parseTileRequest(request: { url: string }): z.infer<typeof tilePathSchema> {
  const url = new URL(request.url)
  if (url.hostname !== 'tiles') {
    throw new Error('Unsupported raster protocol host')
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  if (pathParts.length !== 4) {
    throw new Error('Invalid raster tile path')
  }

  const [assetId, z, x, yWithExt] = pathParts
  const y = yWithExt.endsWith('.png') ? yWithExt.slice(0, -4) : yWithExt

  return tilePathSchema.parse({
    assetId,
    z,
    x,
    y
  })
}
