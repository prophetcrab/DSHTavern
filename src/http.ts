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

/** Largest request body the tavern routes accept. */
const MAX_BODY_BYTES = 64 * 1024

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
 * @param req - incoming request.
 * @returns the parsed object; `{}` when the body is empty.
 */
export function readJsonObject(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('request body is too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          reject(new Error('request body must be a JSON object'))
          return
        }
        resolve(value as Record<string, unknown>)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
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
