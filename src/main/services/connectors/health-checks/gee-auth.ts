import { createSign } from 'crypto'
import { fetchWithTimeout } from './http-utils'

const GOOGLE_OAUTH_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const EARTH_ENGINE_SCOPE = 'https://www.googleapis.com/auth/earthengine.readonly'

interface GoogleServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
}

const base64UrlEncode = (value: string | Buffer): string => {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const parseTokenErrorMessage = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null
  }
  const record = payload as Record<string, unknown>
  if (typeof record.error_description === 'string' && record.error_description.trim().length > 0) {
    return record.error_description.trim()
  }
  if (typeof record.error === 'string' && record.error.trim().length > 0) {
    return record.error.trim()
  }
  return null
}

const createSignedJwtAssertion = (
  serviceAccount: GoogleServiceAccountKey,
  audience: string
): string => {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  const payload = {
    iss: serviceAccount.client_email,
    scope: EARTH_ENGINE_SCOPE,
    aud: audience,
    iat,
    exp
  }

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()

  const signature = signer.sign(serviceAccount.private_key)
  return `${unsignedToken}.${base64UrlEncode(signature)}`
}

const parseServiceAccountPayload = (serviceAccountJson: string): GoogleServiceAccountKey => {
  let parsed: unknown
  try {
    parsed = JSON.parse(serviceAccountJson)
  } catch {
    throw new Error('serviceAccountJson is not valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('serviceAccountJson must be a JSON object')
  }

  const payload = parsed as Record<string, unknown>
  const clientEmail = payload.client_email
  const privateKey = payload.private_key
  const tokenUri = payload.token_uri

  if (typeof clientEmail !== 'string' || clientEmail.trim().length === 0) {
    throw new Error('serviceAccountJson is missing client_email')
  }
  if (typeof privateKey !== 'string' || privateKey.trim().length === 0) {
    throw new Error('serviceAccountJson is missing private_key')
  }

  return {
    client_email: clientEmail.trim(),
    private_key: privateKey,
    token_uri:
      typeof tokenUri === 'string' && tokenUri.trim().length > 0 ? tokenUri.trim() : undefined
  }
}

export const getGoogleEarthEngineAccessToken = async (
  serviceAccountJson: string,
  timeoutMs: number
): Promise<string> => {
  const serviceAccount = parseServiceAccountPayload(serviceAccountJson)
  const tokenUri = serviceAccount.token_uri || GOOGLE_OAUTH_TOKEN_URI
  const assertion = createSignedJwtAssertion(serviceAccount, tokenUri)
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }).toString()

  const response = await fetchWithTimeout(
    tokenUri,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    },
    timeoutMs
  )

  const rawResponse = await response.text()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(rawResponse)
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const details =
      parseTokenErrorMessage(parsed) ||
      (rawResponse.trim().length > 0 ? rawResponse.trim().slice(0, 300) : 'No response body')
    throw new Error(
      `Failed to fetch Google OAuth token (HTTP ${response.status} ${response.statusText}): ${details}`
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Google OAuth token response is invalid JSON')
  }

  const payload = parsed as Record<string, unknown>
  const accessToken = payload.access_token
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    throw new Error('Google OAuth token response did not include access_token')
  }

  return accessToken.trim()
}
