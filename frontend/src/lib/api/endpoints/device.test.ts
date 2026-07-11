import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));
import { apiFetch } from '$lib/api/client';
import { lookupDeviceCode, decideDevice, DeviceLookupFailure } from './device';

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
it('looks up and decides device codes', async () => {
	await lookupDeviceCode('ABCD').catch(() => {});
	await decideDevice('ABCD', 'approve').catch(() => {});
	await decideDevice('ABCD', 'deny').catch(() => {});
	expect(f).toHaveBeenCalled();
	const first = f.mock.calls[0][0] as Request;
	expect(first.url).toContain('/api/auth/device/verify?code=ABCD');
});
it('maps the {valid:false} body to a not-found failure', async () => {
	f.mockImplementation(async () => jsonRes({ valid: false }));
	await expect(lookupDeviceCode('BAD1')).rejects.toMatchObject({ kind: 'not-found' });
	f.mockImplementation(async () => jsonRes({}, 401));
	await expect(lookupDeviceCode('BAD1')).rejects.toBeInstanceOf(DeviceLookupFailure);
});
