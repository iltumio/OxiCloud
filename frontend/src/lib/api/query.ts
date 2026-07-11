/**
 * openapi × @tanstack/svelte-query glue — the typed query layer.
 *
 * There is no `openapi-svelte-query` on npm (only the React flavour), so this
 * module provides the equivalent: options factories bound to the typed
 * openapi-fetch client. Paths, params, bodies and response types all infer
 * from `ApiPaths`.
 *
 * Usage in a component:
 *
 * ```svelte
 * <script lang="ts">
 *   import { createQuery, createMutation } from '@tanstack/svelte-query';
 *   import { apiQueryOptions, apiMutationOptions } from '$lib/api/query';
 *
 *   const trash = createQuery(() => apiQueryOptions('get', '/api/trash'));
 *   const restore = createMutation(() =>
 *     apiMutationOptions('post', '/api/trash/{id}/restore')
 *   );
 *   // restore.mutate({ params: { path: { id } } })
 * </script>
 * ```
 *
 * Invalidation: keys are `[method, path, init]`, so
 * `queryClient.invalidateQueries({ queryKey: apiQueryKey('get', '/api/trash') })`
 * hits every variant of that endpoint regardless of params.
 */

import { mutationOptions, queryOptions } from '@tanstack/svelte-query';
import type { FetchResponse, MaybeOptionalInit } from 'openapi-fetch';
import type {
	HttpMethod,
	MediaType,
	PathsWithMethod,
	RequiredKeysOf
} from 'openapi-typescript-helpers';
import { api, type ApiPaths } from './index';
import { ApiError } from './client';

/** Mirrors openapi-fetch's (unexported) InitParam: optional iff no required keys. */
type InitParam<T> = RequiredKeysOf<NonNullable<T>> extends never ? [T?] : [T];

type Init<
	Method extends HttpMethod,
	Path extends PathsWithMethod<ApiPaths, Method>
> = MaybeOptionalInit<ApiPaths[Path], Method>;

type Data<Method extends HttpMethod, Path extends PathsWithMethod<ApiPaths, Method>> = NonNullable<
	FetchResponse<NonNullable<ApiPaths[Path][Method]>, object, MediaType>['data']
>;

/**
 * Internal dispatch. The public factories below carry the full generic
 * constraints; this erases them once (via `unknown`, never `any`) because
 * openapi-fetch's variadic-tuple inference cannot flow through a wrapper.
 */
const dispatch = api.request as unknown as (
	method: HttpMethod,
	path: string,
	init?: unknown
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;

async function request<Method extends HttpMethod, Path extends PathsWithMethod<ApiPaths, Method>>(
	method: Method,
	path: Path,
	init: unknown
): Promise<Data<Method, Path>> {
	const { data, error, response } = await dispatch(method, path, init);
	if (error !== undefined) {
		throw new ApiError(response.status, response.statusText, path);
	}
	return data as Data<Method, Path>;
}

/** Stable query key for an endpoint (+ optional init) — use for invalidation. */
export function apiQueryKey<
	Method extends HttpMethod,
	Path extends PathsWithMethod<ApiPaths, Method>
>(method: Method, path: Path, ...init: InitParam<Init<Method, Path>>) {
	return init.length === 0 ? ([method, path] as const) : ([method, path, init[0]] as const);
}

/** Typed `queryOptions` for a GET-style endpoint. */
export function apiQueryOptions<
	Method extends HttpMethod,
	Path extends PathsWithMethod<ApiPaths, Method>
>(method: Method, path: Path, ...init: InitParam<Init<Method, Path>>) {
	return queryOptions({
		queryKey: [method, path, init[0]] as const,
		queryFn: ({ signal }) => request(method, path, { ...init[0], signal })
	});
}

/**
 * Typed `mutationOptions`; the mutation variables are the request init
 * (params/body), so one mutation instance serves any target of the endpoint.
 */
export function apiMutationOptions<
	Method extends HttpMethod,
	Path extends PathsWithMethod<ApiPaths, Method>
>(method: Method, path: Path) {
	return mutationOptions({
		mutationKey: [method, path] as const,
		mutationFn: (init: Init<Method, Path>) => request(method, path, init)
	});
}
