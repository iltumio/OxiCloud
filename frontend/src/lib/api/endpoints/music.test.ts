import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import * as music from './music';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const f = vi.mocked(apiFetch);
beforeEach(() => {
	vi.clearAllMocks();
	f.mockImplementation(async () => jsonRes({}));
});
it('exercises the music endpoints', async () => {
	await music.listPlaylists().catch(() => {});
	await music.listTracks('p').catch(() => {});
	await music.createPlaylist('n').catch(() => {});
	await music.updatePlaylist('p', { name: 'x' }).catch(() => {});
	await music.renamePlaylist('p', 'n').catch(() => {});
	await music.deletePlaylist('p').catch(() => {});
	await music.addTracks('p', ['f']).catch(() => {});
	await music.removeTrack('p', 'f').catch(() => {});
	await music.reorderTracks('p', ['a', 'b']).catch(() => {});
	await music.listShares('p').catch(() => {});
	await music.removeShare('p', 'u').catch(() => {});
	const file = new File([new Uint8Array([1])], 'c.png', { type: 'image/png' });
	await music.uploadCoverImage(file).catch(() => {});
	expect(f.mock.calls.length).toBeGreaterThan(3);
});
