/** Photos timeline endpoint — ported from features/library/photos.js. */
import { api } from '$lib/api';
import type { FileItem } from '$lib/api/types';

/**
 * A timeline photo/video. Extends {@link FileItem} with the pixel dimensions the
 * list endpoint returns, used by the justified (aspect-preserving) grid layout.
 */
export interface PhotoItem extends FileItem {
	width?: number;
	height?: number;
}

export interface PhotoPage {
	items: PhotoItem[];
	nextCursor: string | null;
}

/** EXIF metadata returned by `/api/files/{id}/metadata` (subset used by the lightbox). */
export interface FileMetadata {
	file_id: string;
	captured_at?: number;
	latitude?: number | null;
	longitude?: number | null;
	camera_make?: string | null;
	camera_model?: string | null;
	orientation?: number | null;
	width?: number | null;
	height?: number | null;
}

/** Result of a batch trash request (200 = all, 206 = partial success). */
export interface BatchTrashResult {
	successful: string[];
	failed: string[];
}

/** One server-side photo cluster for the Places map (`GET /api/photos/geo`). */
export interface GeoCluster {
	lng: number;
	lat: number;
	count: number;
	sample_file_id: string;
}

/**
 * Fetch geotagged-photo clusters for a viewport. The backend aggregates
 * server-side on a grid keyed by zoom, so the client draws one lightweight
 * marker per cluster — no client-side clustering needed. `bbox` is
 * `"west,south,east,north"` in decimal degrees. Available only when the
 * Places feature is enabled (otherwise the route 404s).
 */
export async function fetchPhotosGeo(bbox: string, zoom: number): Promise<GeoCluster[]> {
	const { data, response } = await api.GET('/api/photos/geo', {
		params: { query: { bbox, zoom } }
	});
	if (!response.ok || !data) throw new Error(`photos geo failed: ${response.status}`);
	return data;
}

/** Backend `MAX_BATCH_SIZE` — chunk larger selections into separate requests. */
const BATCH_CHUNK_SIZE = 1000;

/**
 * Fetch one page of the photo timeline. The next-page cursor is returned in the
 * `X-Next-Cursor` response header; the page is the last one when fewer than
 * `limit` items come back.
 */
export async function fetchPhotos(limit = 60, before?: string | null): Promise<PhotoPage> {
	const { data, response } = await api.GET('/api/photos', {
		params: { query: { limit, ...(before ? { before } : {}) } }
	});
	if (!response.ok) throw new Error(`photos failed: ${response.status}`);
	const items = data ?? [];
	const cursor = response.headers.get('X-Next-Cursor');
	return {
		items,
		nextCursor: cursor && items.length >= limit ? cursor : null
	};
}

/** Fetch EXIF metadata for a file. Returns `null` on any error (non-critical). */
export async function fetchFileMetadata(fileId: string): Promise<FileMetadata | null> {
	try {
		const { data, response } = await api.GET('/api/files/{id}/metadata', {
			params: { path: { id: fileId } }
		});
		if (!response.ok || !data) return null;
		return data;
	} catch {
		return null;
	}
}

/**
 * Move files to trash in batches via `POST /api/batch/trash`. One request per
 * chunk (up to {@link BATCH_CHUNK_SIZE} ids); 200 = all trashed, 206 = partial.
 * Returns the set of ids that were actually trashed across all chunks.
 */
export async function batchTrash(fileIds: string[]): Promise<Set<string>> {
	const trashed = new Set<string>();
	for (let i = 0; i < fileIds.length; i += BATCH_CHUNK_SIZE) {
		const chunk = fileIds.slice(i, i + BATCH_CHUNK_SIZE);
		const { data, response } = await api.POST('/api/batch/trash', {
			body: { file_ids: chunk, folder_ids: [] }
		});
		// 200 = all trashed, 206 = partial; both are ok and carry `successful`.
		if (!response.ok) continue;
		const ok = Array.isArray(data?.successful) ? data.successful : chunk;
		for (const id of ok) trashed.add(id);
	}
	return trashed;
}
