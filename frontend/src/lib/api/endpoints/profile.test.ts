import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import * as profile from './profile';

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
it('isAutoAppPassword flags generated labels', () => {
	expect(profile.isAutoAppPassword({ label: 'Nextcloud' })).toBe(true);
	expect(profile.isAutoAppPassword({ label: 'my token' })).toBe(false);
});
it('exercises the profile endpoints', async () => {
	await profile.updateProfile({ given_name: 'A' }).catch(() => {});
	await profile.changePassword('old', 'new').catch(() => {});
	await profile.updateAvatar('data:image/png;base64,AAAA').catch(() => {});
	await profile.updateAvatar(null).catch(() => {});
	await profile.listAppPasswords().catch(() => {});
	await profile.createAppPassword('label').catch(() => {});
	await profile.revokeAppPassword('id').catch(() => {});
	expect(f.mock.calls.length).toBeGreaterThan(2);
});
it('listAppPasswords unwraps both wire shapes', async () => {
	f.mockImplementation(async () => jsonRes([{ id: '1', label: 'a', created_at: 'now' }]));
	await expect(profile.listAppPasswords()).resolves.toHaveLength(1);
	f.mockImplementation(async () =>
		jsonRes({ app_passwords: [{ id: '2', label: 'b', created_at: 'now' }] })
	);
	await expect(profile.listAppPasswords()).resolves.toHaveLength(1);
	f.mockImplementation(async () => jsonRes({}, 500));
	await expect(profile.listAppPasswords()).resolves.toEqual([]);
});
