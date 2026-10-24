/**
 * Minimal JSON route helpers for the tavern host half.
 *
 * The tavern panel is a page-level surface, so its data crosses the Host
 * boundary over the composition's `webServer` named routes: the same transport
 * the installed ProjectVW plugin uses. Routes stay loopback-only because the
 * tavern panel only ever runs on the machine serving the GUI.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Methods the tavern routes accept. */
export type HttpMethod = 'GET' | 'POST';
/** A handler that owns its full response lifecycle. */
export type JsonRouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
/**
 * Body limit for routes whose payload has no larger stored counterpart.
 *
 * Routes that write a bounded document pass that document's own ceiling plus
 * room for JSON escaping instead: a single global limit here would reject a
 * character card or worldbook the store itself accepts.
 */
export declare const DEFAULT_MAX_BODY_BYTES: number;
/** A request body could not be read as a JSON object. */
export declare class HttpRequestError extends Error {
    readonly status: 400 | 413;
    constructor(message: string, status: 400 | 413);
}
/**
 * Reject requests that did not originate from this machine.
 * @param req - incoming request.
 * @param res - response used for the rejection.
 * @returns whether the request may proceed.
 */
export declare function allowLoopback(req: IncomingMessage, res: ServerResponse): boolean;
/**
 * Write one JSON response.
 * @param res - response to complete.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
export declare function sendJson(res: ServerResponse, status: number, payload: unknown): void;
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
export declare function readJsonObject(req: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown>>;
/**
 * Answer a request made with the wrong method.
 * @param res - response to complete.
 * @param allowed - the method this route accepts.
 */
export declare function methodNotAllowed(res: ServerResponse, allowed: HttpMethod): void;
/**
 * Read an optional string field from a request body.
 * @param body - parsed request body.
 * @param field - field name.
 * @returns the trimmed string, or `undefined` when absent or not a string.
 */
export declare function optionalString(body: Record<string, unknown>, field: string): string | undefined;
