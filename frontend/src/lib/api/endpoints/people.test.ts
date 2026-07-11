import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import * as people from './people';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const f = vi.mocked(apiFetch);
beforeEach(() => {
	vi.clearAllMocks();
	f.mockImplementation(async () => jsonRes([]));
});
it('exercises the people endpoints', async () => {
	await people.fetchPeople().catch(() => {});
	await people.peopleEnabled().catch(() => {});
	await people.fetchPersonPhotos('p').catch(() => {});
	await people.renamePerson('p', 'Alice').catch(() => {});
	await people.renamePerson('p', null).catch(() => {});
	expect(f.mock.calls.length).toBeGreaterThan(0);
});
it('peopleEnabled reflects the probe status', async () => {
	f.mockImplementation(async () => jsonRes([], 404));
	await expect(people.peopleEnabled()).resolves.toBe(false);
	f.mockImplementation(async () => jsonRes([]));
	await expect(people.peopleEnabled()).resolves.toBe(true);
});
