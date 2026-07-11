import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import { searchFiles, searchSuggest, clearSearchCache } from './search';

const jsonRes = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const f = vi.mocked(apiFetch);
beforeEach(() => {
	vi.clearAllMocks();
	f.mockImplementation(async () => jsonRes({ files: [], folders: [] }));
});
it('builds search requests including filters', async () => {
	await searchFiles('q', {
		recursive: true,
		fileTypes: ['mp3', 'wav'],
		minSize: 1,
		maxSize: 9,
		sortBy: 'date'
	}).catch(() => {});
	const search = f.mock.calls[0][0] as Request;
	expect(search.url).toContain('/api/search?');
	expect(search.url).toContain('type=mp3%2Cwav');
	expect(search.url).toContain('sort_by=date');
	await searchSuggest('q').catch(() => {});
	await clearSearchCache().catch(() => {});
	expect(f).toHaveBeenCalledTimes(3);
	expect((f.mock.calls[1][0] as Request).url).toContain('/api/search/suggest?query=q');
	expect((f.mock.calls[2][0] as Request).method).toBe('DELETE');
});
