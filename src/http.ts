/**
 * Minimal JSON route helpers for the tavern host half.
 *
 * The tavern panel is a page-level surface, so its data crosses the Host
 * boundary over the composition's `webServer` named routes: the same transport
 * the installed ProjectVW plugin uses. Routes stay loopback-only because the
 * tavern panel only ever runs on the machine serving the GUI.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Methods the tavern routes accept. */
export type HttpMethod = 'GET' | 'POST'

/** A handler that owns its full response lifecycle. */
export type JsonRouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/**
 * Body limit for routes whose payload has no larger stored counterpart.
 *
 * Routes that write a bounded document pass that document's own ceiling plus
 * room for JSON escaping instead: a single global limit here would reject a
 * character card or worldbook the store itself accepts.
 */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

/** A request body could not be read as a JSON object. */
export class HttpRequestError extends Error {
  constructor(message: string, readonly status: 400 | 413) {
    super(message)
    this.name = 'HttpRequestError'
  }
}

/**
 * Reject requests that did not originate from this machine.
 * @param req - incoming request.
 * @param res - response used for the rejection.
 * @returns whether the request may proceed.
 */
export function allowLoopback(req: IncomingMessage, res: ServerResponse): boolean {
  const address = req.socket.remoteAddress
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  if (!loopback) {
    sendJson(res, 403, { ok: false, error: 'forbidden' })
    return false
  }
  if (String(req.headers['sec-fetch-site'] ?? '') === 'cross-site') {
    sendJson(res, 403, { ok: false, error: 'forbidden' })
    return false
  }
  return true
}

/**
 * Write one JSON response.
 * @param res - response to complete.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  try {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(payload))
  } catch {
    try { res.destroy() } catch { /* the socket is already gone */ }
  }
}

/**
 * Read and parse one JSON object request body.
 *
 * The caller owns the size ceiling because it is the only layer that knows how
 * large a legitimate payload is: the same host accepts a 256 KiB character card
 * and a multi-megabyte worldbook export, while the agent settings route never
 * needs more than a few kilobytes.
 * @param req - incoming request.
 * @param maxBytes - largest body this route accepts.
 * @returns the parsed object; `{}` when the body is empty.
 * @throws HttpRequestError with status 413 when the body exceeds `maxBytes`, or
 *   400 when it is not a JSON object.
 */
export function readJsonObject(
  req: IncomingMessage,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let overflowed = false
    req.on('data', (chunk: Buffer) => {
      if (overflowed) return
      size += chunk.length
      if (size > maxBytes) {
        // Stop buffering but keep reading: the handler still has to write a
        // 413, and answering before the upload finishes turns the response into
        // a bare connection reset on some clients.
        overflowed = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (overflowed) {
        reject(new HttpRequestError(`request body exceeds ${maxBytes} bytes`, 413))
        return
      }
      if (chunks.length === 0) {
        resolve({})
        return
      }
      let value: unknown
      try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch (error) {
        reject(new HttpRequestError(error instanceof Error ? error.message : String(error), 400))
        return
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        reject(new HttpRequestError('request body must be a JSON object', 400))
        return
      }
      resolve(value as Record<string, unknown>)
    })
    req.on('error', reject)
  })
}

/**
 * Answer a request made with the wrong method.
 * @param res - response to complete.
 * @param allowed - the method this route accepts.
 */
export function methodNotAllowed(res: ServerResponse, allowed: HttpMethod): void {
  res.setHeader('allow', allowed)
  sendJson(res, 405, { ok: false, error: `method not allowed; use ${allowed}` })
}

/**
 * Read an optional string field from a request body.
 * @param body - parsed request body.
 * @param field - field name.
 * @returns the trimmed string, or `undefined` when absent or not a string.
 */
export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
