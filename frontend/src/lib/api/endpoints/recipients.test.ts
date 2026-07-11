import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
vi.mock('$lib/stores/session.svelte', () => ({ session: { user: null } }));
import { apiFetch } from '$lib/api/client';
import {
	isDirectoryAvailable,
	resolveLabel,
	resolveRecipient,
	searchRecipients
} from './recipients';

const jsonRes = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const f = vi.mocked(apiFetch);
describe('recipients pure helpers', () => {
	it('isDirectoryAvailable defaults to true', () => {
		expect(isDirectoryAvailable()).toBe(true);
	});
	it('resolveLabel falls back to the id when uncached', () => {
		expect(resolveLabel('group', 'g1')).toBe('g1');
		expect(resolveLabel('user', 'u1')).toBe('u1');
	});
	it('resolveRecipient builds a recipient object', () => {
		expect(resolveRecipient('group', 'g1')).toMatchObject({ type: 'group', id: 'g1', label: 'g1' });
		expect(resolveRecipient('user', 'u1')).toMatchObject({ type: 'user', id: 'u1' });
	});
});
describe('searchRecipients', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// system contacts + group search both return JSON arrays
		f.mockImplementation(async () => jsonRes([]));
	});
	it('returns an array of recipients', async () => {
		const r = await searchRecipients('alice').catch(() => []);
		expect(Array.isArray(r)).toBe(true);
		const e = await searchRecipients('a@b.test').catch(() => []);
		expect(Array.isArray(e)).toBe(true);
		// The unknown email surfaces as an invite-by-email suggestion.
		expect(e).toContainEqual({ type: 'email', id: 'a@b.test', label: 'a@b.test' });
	});
});
