/** File endpoints — ported from the legacy module onto the typed client. */
import { api } from '$lib/api';
import { apiFetch } from '$lib/api/client';
import { getCsrfHeaders } from '$lib/api/csrf';
import { throwFailed } from '$lib/api/http';

/**
 * Instant upload: materialise a file from a blob the caller **already owns**,
 * by its whole-file BLAKE3 — zero content bytes cross the wire. Returns the HTTP
 * status so the caller can fall back to a plain upload on 404 (hash not owned).
 * Scoped to the caller's own content server-side (no cross-user probing).
 */
export async function createFileByHash(
	folderId: string,
	name: string,
	hash: string
): Promise<{ ok: boolean; status: number; data?: unknown }> {
	const { data, response } = await api.POST('/api/files/by-hash', {
		body: { name, folder_id: folderId, hash }
	});
	return { ok: response.ok, status: response.status, data };
}

/**
 * Batch dedup check: given candidate whole-file BLAKE3 hashes, return the set
 * the caller **already owns** — in a single round trip. Drives instant uploads:
 * a file whose hash is in the set can be created with zero content bytes.
 * Resolves an empty set on any non-2xx, so the caller just uploads everything.
 */
export async function dedupCheckBatch(hashes: string[]): Promise<Set<string>> {
	if (hashes.length === 0) return new Set();
	const { data, response } = await api.POST('/api/dedup/check-batch', {
		body: { hashes }
	});
	if (!response.ok) return new Set();
	return new Set(data?.owned ?? []);
}

export async function uploadFile(folderId: string | null, file: File): Promise<void> {
	const form = new FormData();
	if (folderId) form.append('folder_id', folderId);
	form.append('file', file);
	const res = await apiFetch('/api/files/upload', {
		method: 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
		headers: getCsrfHeaders(), // multipart boundary set automatically; do not set Content-Type
		body: form
	});
	if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

/**
 * Upload with progress reporting. `fetch` can't surface upload progress, so this
 * uses XHR; CSRF headers are attached the same way as {@link uploadFile}.
 * `onProgress` receives a fraction in [0, 1] (or NaN when length is unknown).
 */
export function uploadFileWithProgress(
	folderId: string | null,
	file: File,
	onProgress: (fraction: number) => void
): Promise<void> {
	return new Promise((resolve, reject) => {
		const form = new FormData();
		if (folderId) form.append('folder_id', folderId);
		form.append('file', file);
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/files/upload');
		xhr.withCredentials = true;
		for (const [k, v] of Object.entries(getCsrfHeaders())) xhr.setRequestHeader(k, v);

		// Self-aborting watchdog so a stalled connection can never pin an upload
		// slot forever (and leave a zombie XHR holding one of the browser's few
		// per-host connections). While the body is uploading we reset the deadline
		// on every progress tick — a slow but *moving* transfer is fine; once the
		// body is fully sent we give the server a fixed window to respond. On a
		// stall we `xhr.abort()`, which frees the connection immediately.
		const SEND_STALL_MS = 30_000;
		const RESPONSE_MS = 60_000;
		let watchdog: ReturnType<typeof setTimeout>;
		const arm = (ms: number) => {
			clearTimeout(watchdog);
			watchdog = setTimeout(() => xhr.abort(), ms);
		};

		xhr.upload.onprogress = (e) => {
			onProgress(e.lengthComputable ? e.loaded / e.total : NaN);
			arm(SEND_STALL_MS);
		};
		xhr.upload.onload = () => arm(RESPONSE_MS); // body sent — wait for the server
		xhr.onload = () => {
			clearTimeout(watchdog);
			if (xhr.status >= 200 && xhr.status < 300) resolve();
			else {
				// Flag quota so a batch can stop early instead of retrying every file.
				const err = new Error(`upload failed: ${xhr.status}`) as Error & { isQuota?: boolean };
				err.isQuota = xhr.status === 507;
				reject(err);
			}
		};
		xhr.onerror = () => {
			clearTimeout(watchdog);
			reject(new Error('upload failed: network error'));
		};
		xhr.onabort = () => {
			clearTimeout(watchdog);
			reject(new Error('upload stalled — aborted'));
		};
		arm(SEND_STALL_MS);
		xhr.send(form);
	});
}

export async function renameFile(fileId: string, name: string): Promise<void> {
	const { response } = await api.PUT('/api/files/{id}/rename', {
		params: { path: { id: fileId } },
		body: { name }
	});
	if (!response.ok) throwFailed('rename file', response);
}

export async function moveFile(fileId: string, targetFolderId: string | null): Promise<void> {
	const { response } = await api.PUT('/api/files/{id}/move', {
		params: { path: { id: fileId } },
		body: { folder_id: targetFolderId || null }
	});
	if (!response.ok) throwFailed('move file', response);
}

export async function deleteFile(fileId: string): Promise<void> {
	const { response } = await api.DELETE('/api/files/{id}', {
		params: { path: { id: fileId } }
	});
	if (!response.ok) throwFailed('delete file', response);
}

export function fileDownloadUrl(fileId: string): string {
	return `/api/files/${fileId}`;
}

export function fileInlineUrl(fileId: string): string {
	return `/api/files/${fileId}?inline=true`;
}

/** Thumbnail URL for a file at the given size (server-rendered, content-typed). */
export function fileThumbnailUrl(
	fileId: string,
	size: 'icon' | 'preview' | 'large' = 'preview'
): string {
	return `/api/files/${fileId}/thumbnail/${size}`;
}
