import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import { fetchRecentPage, clearRecent } from './recent';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const f = vi.mocked(apiFetch);
beforeEach(() => {
	vi.clearAllMocks();
	f.mockImplementation(async () => jsonRes({ items: [], next_cursor: null }));
});
it('fetches and clears recent', async () => {
	await fetchRecentPage({}).catch(() => {});
	await clearRecent().catch(() => {});
	expect(f).toHaveBeenCalledTimes(2);
	const [page, clear] = f.mock.calls.map(([input]) => input as Request);
	expect(page.url).toContain('/api/recent/resources?order_by=accessed_at&limit=50');
	expect(clear.url).toContain('/api/recent/clear');
	expect(clear.method).toBe('DELETE');
});
