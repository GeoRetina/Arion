import { protocol, type Session } from 'electron'
import { z } from 'zod'
import { getVectorAssetService, type VectorAssetService } from './vector-asset-service'

export const VECTOR_PROTOCOL_SCHEME = 'arion-vector'

const vectorAssetPathSchema = z.object({
  assetId: z.string().uuid()
})

let protocolRegistered = false

export function registerVectorProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: VECTOR_PROTOCOL_SCHEME,
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

export function registerVectorAssetProtocol(
  session: Session,
  vectorAssetService: VectorAssetService = getVectorAssetService()
): void {
  if (protocolRegistered) {
    return
  }

  session.protocol.handle(VECTOR_PROTOCOL_SCHEME, async (request) => {
    try {
      const assetRequest = parseAssetRequest(request)
      const assetBuffer = await vectorAssetService.readAsset(assetRequest.assetId)

      return new Response(new Uint8Array(assetBuffer), {
        status: 200,
        headers: {
          'content-type': 'application/geo+json; charset=utf-8',
          'cache-control': 'public, max-age=86400'
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read vector asset'
      const status = /not found|enoent|no such file/i.test(message) ? 404 : 400
      console.error(`Vector asset request failed (${request.url}): ${message}`)

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

function parseAssetRequest(request: { url: string }): z.infer<typeof vectorAssetPathSchema> {
  const url = new URL(request.url)
  if (url.hostname !== 'assets') {
    throw new Error('Unsupported vector protocol host')
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  if (pathParts.length !== 1) {
    throw new Error('Invalid vector asset path')
  }

  const [assetFileName] = pathParts
  const assetId = assetFileName.endsWith('.geojson')
    ? assetFileName.slice(0, -'.geojson'.length)
    : assetFileName

  return vectorAssetPathSchema.parse({ assetId })
}
