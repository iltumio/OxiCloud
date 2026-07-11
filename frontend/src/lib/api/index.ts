/**
 * Typed API client — openapi-fetch over the refresh-aware `apiFetch`.
 *
 * `ApiPaths` merges the generated OpenAPI types (favorites/recent/shares/
 * trash, from `npm run generate:api`) with the hand-authored `ExtraPaths`
 * for endpoints the backend spec doesn't document yet. Both sides get the
 * same compile-time checking of paths, params, bodies and responses.
 *
 * CSRF: a middleware stamps `X-CSRF-Token` on every mutating request, so
 * endpoint modules never handle it themselves.
 */

import createClient from 'openapi-fetch';
import type { paths as GeneratedPaths } from './generated/schema';
import type { ExtraPaths } from './paths';
import { apiFetch } from './client';
import { getCsrfHeaders } from './csrf';

export type ApiPaths = GeneratedPaths & ExtraPaths;

const CSRF_EXEMPT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** App-wide typed client. Route non-JSON/odd calls through `apiFetch` instead. */
export const api = createClient<ApiPaths>({
	// An explicit absolute base is required: openapi-fetch builds a `new
	// Request(url)` BEFORE our fetch runs, and undici (Node/Vitest) rejects
	// relative URLs. In the browser this resolves to the current origin, so the
	// same-origin/CSRF behaviour is unchanged.
	baseUrl: typeof location !== 'undefined' ? location.origin : 'http://localhost',
	fetch: (request) => apiFetch(request)
});

api.use({
	onRequest({ request }) {
		if (!CSRF_EXEMPT_METHODS.has(request.method)) {
			for (const [name, value] of Object.entries(getCsrfHeaders())) {
				request.headers.set(name, value);
			}
		}
		return request;
	}
});

export { apiFetch, apiJson, ApiError, setSessionExpiredHandler } from './client';
export { getCsrfHeaders, getCsrfToken } from './csrf';
