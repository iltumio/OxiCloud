/**
 * Small runtime helpers shared by the endpoint modules built on the typed
 * openapi-fetch client (`$lib/api`). openapi-fetch parses non-2xx JSON bodies
 * into `error`; these extract the server's human-readable detail and
 * standardise the "throw on failure" pattern so every module reports errors
 * the same way the legacy modules did.
 */

import { ApiError } from './client';

/** Best-effort extraction of the server's `error` / `message` detail. */
export function errorDetail(error: unknown): string {
	if (typeof error === 'object' && error !== null) {
		const e = error as { error?: unknown; message?: unknown };
		if (typeof e.error === 'string' && e.error) return e.error;
		if (typeof e.message === 'string' && e.message) return e.message;
	}
	return '';
}

/**
 * Throw for a failed typed-client call: the server's detail message when the
 * error body carries one, else `<what> failed: <status>`.
 */
export function throwFailed(what: string, response: Response, error?: unknown): never {
	throw new Error(errorDetail(error) || `${what} failed: ${response.status}`);
}

/**
 * Unwrap the `data` of a typed-client read, throwing an {@link ApiError}
 * (mirroring the legacy `apiJson` behaviour) when the request failed or the
 * response carried no body.
 */
export function ensureData<T>(data: T | undefined, response: Response, resource: string): T {
	if (!response.ok || data === undefined) {
		throw new ApiError(response.status, response.statusText, resource);
	}
	return data;
}
