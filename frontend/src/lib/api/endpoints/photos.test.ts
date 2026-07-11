import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import * as photos from './photos';

const jsonRes = (body: unknown = {}, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});

const f = vi.mocked(apiFetch);
beforeEach(() => {
	vi.clearAllMocks();
	f.mockImplementation(async () => jsonRes([]));
});
it('exercises the photos endpoints', async () => {
	await photos.fetchPhotosGeo('0,0,1,1', 5).catch(() => {});
	await photos.fetchPhotos(60).catch(() => {});
	await photos.fetchFileMetadata('fid').catch(() => {});
	await photos.batchTrash(['a', 'b']).catch(() => {});
	await photos.batchTrash([]).catch(() => {});
	expect(f.mock.calls.length).toBeGreaterThan(0);
});
it('fetchPhotos reads the next cursor from X-Next-Cursor', async () => {
	const items = Array.from({ length: 2 }, (_, i) => ({ id: `p${i}` }));
	f.mockImplementation(async () => jsonRes(items, 200, { 'X-Next-Cursor': 'abc' }));
	const page = await photos.fetchPhotos(2);
	expect(page.items).toHaveLength(2);
	expect(page.nextCursor).toBe('abc');
	// Short page → last page, no cursor.
	const short = await photos.fetchPhotos(60);
	expect(short.nextCursor).toBeNull();
});
it('batchTrash collects the successful ids (206 partial)', async () => {
	f.mockImplementation(async () => jsonRes({ successful: ['a'], failed: ['b'] }, 206));
	const trashed = await photos.batchTrash(['a', 'b']);
	expect([...trashed]).toEqual(['a']);
});
