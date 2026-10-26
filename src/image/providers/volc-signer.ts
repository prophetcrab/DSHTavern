/**
 * Volcengine Vision API request signing.
 *
 * The service uses AWS Signature Version 4 with a fixed region (`cn-north-1`)
 * and service (`cv`). This is a deliberately small implementation of the
 * canonical-request rules the API documents: sorted query parameters, four
 * signed headers, and an HMAC-SHA256 key chain. A dependency would add more
 * surface than the one request shape needs.
 */
import { createHash, createHmac } from 'node:crypto'

/** Headers the signer returns for the request. */
export interface SignedHeaders {
  readonly 'content-type': string
  readonly 'x-content-sha256': string
  readonly 'x-date': string
  readonly authorization: string
}

/** Inputs for one signed request. */
export interface SignInput {
  readonly method: string
  readonly url: URL
  /** Exact JSON body sent with the request. */
  readonly body: string
  readonly accessKey: string
  readonly secretKey: string
  readonly region: string
  readonly service: string
  /** Instant used for the signature; tests inject it. */
  readonly date?: Date
}

/** AWS canonical URI encoding (spaces are %20; `!'()*` are encoded). */
export function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** @param value - text or bytes. @returns lowercase SHA-256 hex. */
export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

/** @param key - HMAC key. @param value - message. @returns the raw HMAC. */
function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

/** Build the canonical query string with sorted encoded pairs. */
function canonicalQuery(url: URL): string {
  const pairs: Array<[string, string]> = []
  for (const [key, value] of url.searchParams) pairs.push([awsEncode(key), awsEncode(value)])
  pairs.sort((left, right) => left[0] === right[0]
    ? left[1].localeCompare(right[1])
    : left[0].localeCompare(right[0]))
  return pairs.map(([key, value]) => `${key}=${value}`).join('&')
}

/** Format the `x-date` header. */
function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

/**
 * Sign one JSON request.
 * @param input - request and credentials.
 * @returns the headers to send; values never include the secret key.
 */
export function signVolcRequest(input: SignInput): SignedHeaders {
  const url = input.url
  const date = input.date ?? new Date()
  const xDate = amzDate(date)
  const shortDate = xDate.slice(0, 8)
  const payloadHash = sha256Hex(input.body)
  const host = url.host
  const canonicalHeaders = [
    'content-type:application/json',
    `host:${host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`,
    '',
  ].join('\n')
  const signedHeaders = 'content-type;host;x-content-sha256;x-date'
  const canonicalRequest = [
    input.method.toUpperCase(),
    url.pathname.length === 0 ? '/' : url.pathname,
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${shortDate}/${input.region}/${input.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    xDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const dateKey = hmac(`AWS4${input.secretKey}`, shortDate)
  const regionKey = hmac(dateKey, input.region)
  const serviceKey = hmac(regionKey, input.service)
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
  return {
    'content-type': 'application/json',
    'x-content-sha256': payloadHash,
    'x-date': xDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}
