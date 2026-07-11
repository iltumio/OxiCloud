/** Folder endpoints — ported from the legacy module onto the typed client. */
import { api } from '$lib/api';
import { ApiError } from '$lib/api/client';
import { throwFailed } from '$lib/api/http';
import type { FileItem, FolderItem } from '$lib/api/types';

export interface FolderListing {
	folders: FolderItem[];
	files: FileItem[];
	/** Ids in this listing the caller has favorited (server-computed badge set). */
	favoriteIds: string[];
	/** Ids in this listing the caller has an outgoing share/grant on. */
	sharedIds: string[];
}

/** Result of a (possibly conditional) listing fetch. */
export interface FolderListingResult {
	/** 200 with a fresh `listing`, or 304 → the caller should keep its cache. */
	status: number;
	listing?: FolderListing;
	etag?: string;
}

// ── In-memory listing cache (stale-while-revalidate) ─────────────────────────
// Lets the files view paint a previously-visited folder instantly on
// back/forward navigation, then revalidate with `If-None-Match` (304 = no body).
interface CachedFolder {
	listing: FolderListing;
	etag?: string;
}
const FOLDER_CACHE_MAX = 40;
const folderCache = new Map<string, CachedFolder>();

/** Cached listing for a folder, bumped to most-recently-used. */
export function getCachedFolder(folderId: string): CachedFolder | undefined {
	const hit = folderCache.get(folderId);
	if (hit) {
		folderCache.delete(folderId);
		folderCache.set(folderId, hit);
	}
	return hit;
}

export function cacheFolder(folderId: string, listing: FolderListing, etag?: string): void {
	// Learn the children's names for breadcrumb resolution.
	for (const f of listing.folders) rememberFolderName(f.id, f.name);
	folderCache.delete(folderId);
	folderCache.set(folderId, { listing, etag });
	// Evict the least-recently-used entries past the cap.
	while (folderCache.size > FOLDER_CACHE_MAX) {
		const oldest = folderCache.keys().next().value;
		if (oldest === undefined) break;
		folderCache.delete(oldest);
	}
}

/** Drop one folder, or the whole cache (no id), after a mutation. */
export function invalidateFolderCache(folderId?: string): void {
	if (folderId === undefined) folderCache.clear();
	else folderCache.delete(folderId);
}

// ── Folder name cache (breadcrumbs) ──────────────────────────────────────────
// id → name, learned from every listing (a folder's listing names its children)
// and from getFolder. Lets breadcrumbs resolve with zero requests during normal
// navigation (each ancestor was named by its parent's listing); only a cold
// deep-link fetches the names it hasn't seen.
const FOLDER_NAMES_MAX = 1000;
const folderNames = new Map<string, string>();

export function rememberFolderName(id: string, name: string): void {
	folderNames.delete(id);
	folderNames.set(id, name);
	while (folderNames.size > FOLDER_NAMES_MAX) {
		const oldest = folderNames.keys().next().value;
		if (oldest === undefined) break;
		folderNames.delete(oldest);
	}
}

export function getFolderName(id: string): string | undefined {
	return folderNames.get(id);
}

export async function getFolder(id: string): Promise<FolderItem> {
	const { data, response } = await api.GET('/api/folders/{id}', {
		params: { path: { id } },
		cache: 'no-store',
		headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
	});
	if (!response.ok || !data) {
		throw new ApiError(response.status, response.statusText, `/api/folders/${id}`);
	}
	rememberFolderName(data.id, data.name);
	return data;
}

/**
 * Fetch a folder's complete listing (sub-folders + files), rebuilt from the
 * cursor-paginated `/api/folders/{id}/resources` feed — the old combined
 * `/listing` route was removed. We page through to the end (folders sort first
 * under `order_by=name`) and split the mixed resource items back into
 * `folders` / `files`.
 *
 * That feed carries no whole-listing ETag, so the 304 conditional fast-path is
 * gone: `opts.etag` is accepted for call-site compatibility but ignored, and the
 * in-memory `folderCache` is what the views revalidate against. Favorite/share
 * badge sets aren't part of this feed either, so they come back empty for now.
 */
export async function fetchFolderListing(
	folderId: string,
	opts: { etag?: string; forceRefresh?: boolean } = {}
): Promise<FolderListingResult> {
	const folders: FolderItem[] = [];
	const files: FileItem[] = [];
	let cursor: string | undefined;
	do {
		const { data, response } = await api.GET('/api/folders/{id}/resources', {
			params: {
				path: { id: folderId },
				query: {
					order_by: 'name',
					limit: 200,
					...(opts.forceRefresh ? { force_refresh: true } : {}),
					...(cursor ? { cursor } : {})
				}
			},
			cache: 'no-store'
		});
		if (response.status === 403) throw Object.assign(new Error('Forbidden'), { status: 403 });
		if (!response.ok) throw new Error(`listing failed: ${response.status}`);
		for (const it of data?.items ?? []) {
			if (it.resource_type === 'folder') folders.push(it.resource as FolderItem);
			else files.push(it.resource as FileItem);
		}
		cursor = data?.next_cursor;
	} while (cursor);

	return { status: 200, listing: { folders, files, favoriteIds: [], sharedIds: [] } };
}

/** Non-conditional listing fetch (e.g. the move-dialog folder tree). */
export async function listFolder(folderId: string, forceRefresh = false): Promise<FolderListing> {
	const res = await fetchFolderListing(folderId, { forceRefresh });
	return res.listing ?? { folders: [], files: [], favoriteIds: [], sharedIds: [] };
}

export async function createFolder(name: string, parentId: string | null): Promise<FolderItem> {
	const { data, response } = await api.POST('/api/folders', {
		body: { name, parent_id: parentId }
	});
	if (!response.ok || !data) throwFailed('create folder', response);
	return data;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
	const { response } = await api.PUT('/api/folders/{id}/rename', {
		params: { path: { id: folderId } },
		body: { name }
	});
	if (!response.ok) throwFailed('rename folder', response);
}

export async function moveFolder(folderId: string, targetFolderId: string | null): Promise<void> {
	const { response } = await api.PUT('/api/folders/{id}/move', {
		params: { path: { id: folderId } },
		body: { parent_id: targetFolderId || null }
	});
	if (!response.ok) throwFailed('move folder', response);
}

export async function deleteFolder(folderId: string): Promise<void> {
	const { response } = await api.DELETE('/api/folders/{id}', {
		params: { path: { id: folderId } }
	});
	if (!response.ok) throwFailed('delete folder', response);
}

export function folderZipUrl(folderId: string): string {
	return `/api/folders/${folderId}/download?format=zip`;
}
