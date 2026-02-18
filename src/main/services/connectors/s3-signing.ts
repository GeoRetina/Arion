import { createHash, createHmac } from 'crypto'
import type { S3IntegrationConfig } from '../../../shared/ipc-types'

const hashHex = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex')

const hmac = (key: string | Buffer, value: string): Buffer => {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

const encodeRfc3986 = (value: string): string => {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

export const createSignedS3Headers = (
  requestUrl: URL,
  config: S3IntegrationConfig,
  now = new Date()
): Record<string, string> => {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = hashHex('')
  const canonicalUri =
    requestUrl.pathname
      .split('/')
      .map((segment) => encodeRfc3986(segment))
      .join('/') || '/'

  const canonicalQuery = [...requestUrl.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&')

  const signedHeaders = config.sessionToken
    ? 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token'
    : 'host;x-amz-content-sha256;x-amz-date'

  const canonicalHeaders =
    `host:${requestUrl.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    (config.sessionToken ? `x-amz-security-token:${config.sessionToken}\n` : '')

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashHex(canonicalRequest)
  ].join('\n')

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, config.region)
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope},` +
    ` SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }

  if (config.sessionToken) {
    headers['x-amz-security-token'] = config.sessionToken
  }

  return headers
}

export const parseS3XmlError = (body: string): string | null => {
  const codeMatch = body.match(/<Code>([^<]+)<\/Code>/i)
  const messageMatch = body.match(/<Message>([^<]+)<\/Message>/i)
  if (!codeMatch && !messageMatch) {
    return null
  }
  const code = codeMatch?.[1]
  const message = messageMatch?.[1]
  if (code && message) return `${code}: ${message}`
  return code || message || null
}

export const buildS3RequestUrl = (config: S3IntegrationConfig): URL => {
  const endpointInput =
    typeof config.endpoint === 'string' && config.endpoint.trim().length > 0
      ? config.endpoint.trim()
      : `https://s3.${config.region}.amazonaws.com`

  const endpointUrl = new URL(
    endpointInput.startsWith('http://') || endpointInput.startsWith('https://')
      ? endpointInput
      : `https://${endpointInput}`
  )

  const requestUrl = new URL(endpointUrl.toString())
  if (config.forcePathStyle ?? true) {
    const prefix = endpointUrl.pathname.replace(/\/+$/, '')
    requestUrl.pathname = `${prefix}/${config.bucket}`.replace(/\/{2,}/g, '/')
  } else {
    requestUrl.hostname = `${config.bucket}.${endpointUrl.hostname}`
    requestUrl.pathname = endpointUrl.pathname || '/'
  }

  requestUrl.searchParams.set('list-type', '2')
  requestUrl.searchParams.set('max-keys', '1')
  return requestUrl
}
