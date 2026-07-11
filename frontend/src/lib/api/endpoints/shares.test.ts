import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import * as shares from './shares';

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
it('exercises the shares endpoints', async () => {
	await shares.createShare({ itemId: 'i', itemType: 'folder' }).catch(() => {});
	await shares.listSharesForItem('i', 'folder').catch(() => {});
	await shares.getShareById('s').catch(() => {});
	await shares.updateShare('s', {}).catch(() => {});
	await shares.deleteShare('s').catch(() => {});
	expect(f.mock.calls.length).toBeGreaterThan(0);
	// listSharesForItem stays on apiFetch(url, init) — the query filter isn't
	// in the generated spec; the rest arrive as typed-client Requests.
	expect(f.mock.calls[1][0]).toContain('/api/shares?item_id=i&item_type=folder');
	expect((f.mock.calls[4][0] as Request).method).toBe('DELETE');
});
it('listSharesForItem unwraps both wire shapes and swallows failures', async () => {
	f.mockImplementationOnce(async () => jsonRes([{ id: '1' }]));
	await expect(shares.listSharesForItem('i', 'file')).resolves.toHaveLength(1);
	f.mockImplementationOnce(async () => jsonRes({ items: [{ id: '2' }] }));
	await expect(shares.listSharesForItem('i', 'file')).resolves.toHaveLength(1);
	f.mockImplementationOnce(async () => jsonRes({}, 500));
	await expect(shares.listSharesForItem('i', 'file')).resolves.toEqual([]);
});
