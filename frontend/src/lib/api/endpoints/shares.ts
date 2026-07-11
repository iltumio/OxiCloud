/**
 * Public share-link endpoints (/api/shares) — ported from features/sharing.
 * Backed by the generated OpenAPI types (`ShareDto` et al); the results are
 * returned under the legacy `ShareItem` shape callers already consume.
 */
import { api } from '$lib/api';
import { apiFetch } from '$lib/api/client';
import { throwFailed } from '$lib/api/http';
import type { ItemType, ShareItem } from '$lib/api/types';

export interface CreateShareInput {
	itemId: string;
	/** Optional human-readable link name (stored as `item_name`). */
	itemName?: string | null;
	itemType: ItemType;
	password?: string | null;
	/** ISO date string or null; converted to epoch seconds for the wire. */
	expiresAt?: string | null;
}

export async function createShare(input: CreateShareInput): Promise<ShareItem> {
	const { data, error, response } = await api.POST('/api/shares', {
		body: {
			item_id: input.itemId,
			item_name: input.itemName ?? null,
			item_type: input.itemType,
			password: input.password || null,
			expires_at: input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : null
		}
	});
	if (!response.ok || !data) throwFailed('create share', response, error);
	return data as unknown as ShareItem;
}

/**
 * Shares filtered to one item. `GET /api/shares?item_id&item_type` — the query
 * filter isn't in the generated spec yet, so this stays on `apiFetch`.
 */
export async function listSharesForItem(itemId: string, itemType: ItemType): Promise<ShareItem[]> {
	const params = new URLSearchParams({ item_id: itemId, item_type: itemType });
	const res = await apiFetch(`/api/shares?${params}`, { credentials: 'same-origin' });
	if (!res.ok) return [];
	const data = (await res.json()) as ShareItem[] | { items?: ShareItem[] };
	return Array.isArray(data) ? data : (data.items ?? []);
}

/** Fetch a single share by its UUID (used to resolve a token's URL on demand). */
export async function getShareById(shareId: string): Promise<ShareItem> {
	const { data, response } = await api.GET('/api/shares/{id}', {
		params: { path: { id: shareId } }
	});
	if (!response.ok || !data) throwFailed('get share', response);
	return data as unknown as ShareItem;
}

export interface UpdateShareInput {
	/** `null` clears the password; omit to leave it unchanged. */
	password?: string | null;
	/** ISO date string clears/sets; converted to epoch seconds. `null` clears. */
	expiresAt?: string | null;
}

/**
 * Edit an existing public link's password and/or expiry.
 * `PUT /api/shares/{id}` with `{ password, expires_at }`.
 */
export async function updateShare(shareId: string, input: UpdateShareInput): Promise<ShareItem> {
	const body: { password?: string | null; expires_at?: number | null } = {};
	if (input.password !== undefined) body.password = input.password;
	if (input.expiresAt !== undefined) {
		body.expires_at = input.expiresAt
			? Math.floor(new Date(input.expiresAt).getTime() / 1000)
			: null;
	}
	const { data, error, response } = await api.PUT('/api/shares/{id}', {
		params: { path: { id: shareId } },
		body
	});
	if (!response.ok || !data) throwFailed('update share', response, error);
	return data as unknown as ShareItem;
}

export async function deleteShare(shareId: string): Promise<void> {
	const { response } = await api.DELETE('/api/shares/{id}', {
		params: { path: { id: shareId } }
	});
	if (!response.ok && response.status !== 204) throwFailed('delete share', response);
}

/**
 * Copy a share URL to the clipboard, resolving it against the current origin.
 * Shared by the dialog and My Shares so copy-link logic lives in one place.
 * Returns `true` on success.
 */
export async function copyShareLink(url: string): Promise<boolean> {
	try {
		const absolute = typeof location !== 'undefined' ? new URL(url, location.origin).href : url;
		await navigator.clipboard.writeText(absolute);
		return true;
	} catch {
		return false;
	}
}
