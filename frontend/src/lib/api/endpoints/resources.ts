/**
 * Shared cursor-pagination helper for the favorites/recent/trash "resources"
 * endpoints, which all take the same query params. Ported from the original
 * favoritesModel/recentModel/trashModel.
 */
import { apiFetch } from '$lib/api/client';
import type { ResourceFeedQuery } from '$lib/api/paths.sharing';
import type { FileItem, FolderItem, ItemType } from '$lib/api/types';

export interface ResourcePageOpts {
	cursor?: string;
	orderBy?: string;
	limit?: number;
	reverse?: boolean;
	resourceTypes?: ItemType[];
}

export interface ResourcePage<TItem> {
	items: TItem[];
	next_cursor?: string;
}

export type ResourceBody = FileItem | FolderItem;

export function buildResourceParams(opts: ResourcePageOpts, defaultOrderBy: string): string {
	const { cursor, orderBy = defaultOrderBy, limit = 50, reverse = false, resourceTypes } = opts;
	const params = new URLSearchParams({ order_by: orderBy, limit: String(limit) });
	if (cursor) params.set('cursor', cursor);
	if (reverse) params.set('reverse', 'true');
	if (resourceTypes?.length) params.set('resource_types', resourceTypes.join(','));
	return params.toString();
}

/**
 * The same page options as a typed query-parameter object, for the endpoints
 * that go through the typed openapi-fetch client (`/api/favorites/resources`,
 * `/api/recent/resources`, `/api/trash/resources`).
 */
export function resourceFeedQuery(
	opts: ResourcePageOpts,
	defaultOrderBy: string
): ResourceFeedQuery {
	const { cursor, orderBy = defaultOrderBy, limit = 50, reverse = false, resourceTypes } = opts;
	return {
		order_by: orderBy,
		limit,
		...(cursor ? { cursor } : {}),
		...(reverse ? { reverse: true } : {}),
		...(resourceTypes?.length ? { resource_types: resourceTypes.join(',') } : {})
	};
}

export async function fetchResourcePage<TItem>(
	base: string,
	defaultOrderBy: string,
	opts: ResourcePageOpts = {}
): Promise<ResourcePage<TItem>> {
	const qs = buildResourceParams(opts, defaultOrderBy);
	const res = await apiFetch(`${base}?${qs}`, { credentials: 'same-origin', cache: 'no-store' });
	if (!res.ok) throw new Error(`GET ${base} failed: ${res.status}`);
	return (await res.json()) as ResourcePage<TItem>;
}
