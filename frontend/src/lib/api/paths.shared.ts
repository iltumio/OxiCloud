/**
 * Shape vocabulary for the hand-authored `ExtraPaths` modules
 * (`paths.files.ts`, `paths.auth.ts`, …).
 *
 * openapi-typescript emits a rigid structure for every path: a `parameters`
 * bag, one property per HTTP method (`?: never` when the method doesn't
 * exist), operations with `parameters` / `requestBody` / `responses`, and
 * responses keyed by status with `content['application/json']`. These aliases
 * produce exactly that structure without repeating the eight-method stanza on
 * every path, so the hand-authored entries stay structurally identical to the
 * generated `paths` and get the same treatment from openapi-fetch and the
 * query helpers.
 */

import type { HttpMethod } from 'openapi-typescript-helpers';

/** The `parameters` bag when an operation takes none. */
export interface NoParams {
	query?: never;
	header?: never;
	path?: never;
	cookie?: never;
}

/** Path parameters only (`/api/files/{id}` …). */
export interface PathParams<P> {
	query?: never;
	header?: never;
	path: P;
	cookie?: never;
}

/** Optional query parameters only. */
export interface QueryParams<Q> {
	query?: Q;
	header?: never;
	path?: never;
	cookie?: never;
}

/** Required query parameters only. */
export interface RequiredQueryParams<Q> {
	query: Q;
	header?: never;
	path?: never;
	cookie?: never;
}

/** Path + optional query parameters. */
export interface PathAndQueryParams<P, Q> {
	query?: Q;
	header?: never;
	path: P;
	cookie?: never;
}

/** A response entry carrying a JSON body. */
export interface JsonResponse<T> {
	headers: {
		[name: string]: unknown;
	};
	content: {
		'application/json': T;
	};
}

/** A response entry with no documented body. */
export interface EmptyResponse {
	headers: {
		[name: string]: unknown;
	};
	content?: never;
}

/** A response entry streaming raw bytes (downloads, thumbnails). */
export interface BinaryResponse {
	headers: {
		[name: string]: unknown;
	};
	content: {
		'application/octet-stream': string;
	};
}

/** An operation without a request body. */
export interface Op<Responses, Params = NoParams> {
	parameters: Params;
	requestBody?: never;
	responses: Responses;
}

/** An operation with a JSON request body. */
export interface JsonOp<Body, Responses, Params = NoParams> {
	parameters: Params;
	requestBody: {
		content: {
			'application/json': Body;
		};
	};
	responses: Responses;
}

/** An operation with a multipart (FormData) request body. */
export interface MultipartOp<Body, Responses, Params = NoParams> {
	parameters: Params;
	requestBody: {
		content: {
			'multipart/form-data': Body;
		};
	};
	responses: Responses;
}

/**
 * One path item: the given method → operation map, with every other HTTP
 * method marked `?: never` exactly like openapi-typescript emits.
 */
export type PathEntry<Ops extends { [M in HttpMethod]?: unknown }> = {
	parameters: NoParams;
} & Ops & { [M in Exclude<HttpMethod, keyof Ops>]?: never };
