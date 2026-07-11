/** Recent endpoints — ported from recentModel.js. */
import { api } from '$lib/api';
import { throwFailed } from '$lib/api/http';
import {
	resourceFeedQuery,
	type ResourceBody,
	type ResourcePage,
	type ResourcePageOpts
} from './resources';
import type { ItemType } from '$lib/api/types';

export interface RecentResourceItem {
	resource_type: ItemType;
	accessed_at: string;
	resource: ResourceBody;
}

export async function fetchRecentPage(
	opts: ResourcePageOpts = {}
): Promise<ResourcePage<RecentResourceItem>> {
	const { data, response } = await api.GET('/api/recent/resources', {
		params: { query: resourceFeedQuery(opts, 'accessed_at') },
		cache: 'no-store'
	});
	if (!response.ok || !data)
		throw new Error(`GET /api/recent/resources failed: ${response.status}`);
	return data;
}

/**
 * Clear the whole recent feed. `DELETE /api/recent/clear` — the legacy module
 * POSTed here, but the backend route (and the generated spec) only accept
 * DELETE.
 */
export async function clearRecent(): Promise<void> {
	const { response } = await api.DELETE('/api/recent/clear');
	if (!response.ok) throwFailed('clear recent', response);
}
