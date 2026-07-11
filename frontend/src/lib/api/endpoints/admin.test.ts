import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({
	getCsrfHeaders: () => ({ 'x-csrf-token': 't' }),
	getCsrfToken: () => 't'
}));

import { apiFetch } from '$lib/api/client';
import * as admin from './admin';

// The typed openapi-fetch client sends Request objects through apiFetch and
// parses real Responses, so the mock returns a FRESH Response per call.
const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const fetchMock = vi.mocked(apiFetch);
const requests = () => fetchMock.mock.calls.map(([input]) => input as Request);

beforeEach(() => {
	vi.clearAllMocks();
	fetchMock.mockImplementation(async () => jsonRes({}));
});

describe('admin mutation endpoints', () => {
	it('resolve on success and call the expected URL/method', async () => {
		await admin.createUser({
			username: 'u',
			password: 'p',
			email: null,
			role: 'user',
			quota_bytes: 0
		});
		const first = requests()[0];
		expect(first.url).toContain('/api/admin/users');
		expect(first.method).toBe('POST');
		await admin.setUserRole('1', 'admin');
		await admin.setUserActive('1', false);
		await admin.setUserQuota('1', 100);
		await admin.resetUserPassword('1', 'newpw');
		await admin.deleteUser('1');
		await admin.setRegistrationEnabled(true);
		await admin.saveOidc({ enabled: true });
		await admin.saveStorage({ backend: 'local' });
		await admin.savePluginRetention('id', { retention_days: 30, max_bytes: 100 });
		await admin.clearPluginLogs('id');
		await admin.setPluginEnabled('id', true);
		await admin.deletePlugin('id');
		await admin.migrationAction('start');
		await admin.migrationAction('pause');
		expect(fetchMock).toHaveBeenCalled();
		expect(requests().at(-1)!.url).toContain('/api/admin/storage/migration/pause');
	});

	it('throw the server message on failure', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ message: 'conflict' }, 409));
		await expect(admin.deleteUser('1')).rejects.toThrow('conflict');
	});

	it('throw a generic message when the error body has none', async () => {
		fetchMock.mockImplementation(async () => jsonRes({}, 500));
		await expect(admin.setUserActive('1', true)).rejects.toThrow(/failed: 500/);
	});
});

describe('admin read endpoints', () => {
	it('hit the listing/settings read URLs', async () => {
		fetchMock.mockImplementation(async () => jsonRes({}));
		await admin.listUsers(25, 0);
		expect(requests()[0].url).toContain('/api/admin/users?limit=25&offset=0');
		await admin.getDashboard();
		await admin.getSmtpInfo();
		await admin.getOidcSettings();
		await admin.getStorageSettings();
		await admin.getMigration();
		await admin.listPlugins();
		await admin.getPluginLogs('id', { limit: 50, offset: 0 });
		expect(requests().at(-1)!.url).toContain('/api/admin/plugins/id/logs?limit=50&offset=0');
	});

	it('getPluginRetention returns null when the request is not ok', async () => {
		fetchMock.mockImplementationOnce(async () => jsonRes({}, 404));
		await expect(admin.getPluginRetention('id')).resolves.toBeNull();
		fetchMock.mockImplementationOnce(async () => jsonRes({ max_age_days: 7, max_entries: 50 }));
		await expect(admin.getPluginRetention('id')).resolves.toMatchObject({ max_age_days: 7 });
	});
});

describe('admin test/probe endpoints', () => {
	it('sendSmtpTest maps 503 to an unconfigured message', async () => {
		fetchMock.mockImplementation(async () => jsonRes({}, 503));
		await expect(admin.sendSmtpTest('to@x.test')).resolves.toMatchObject({ success: false });
	});

	it('sendSmtpTest returns the parsed result otherwise', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ success: true }));
		await expect(admin.sendSmtpTest('to@x.test')).resolves.toMatchObject({ success: true });
	});

	it('sendSmtpTest returns the parsed failure body on a non-2xx probe', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ success: false, error: 'boom' }, 400));
		await expect(admin.sendSmtpTest('to@x.test')).resolves.toMatchObject({
			success: false,
			error: 'boom'
		});
	});

	it('testOidc / testStorage return parsed results', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ success: true }));
		await expect(admin.testOidc('https://idp')).resolves.toBeTruthy();
		fetchMock.mockImplementation(async () => jsonRes({ connected: true }));
		await expect(admin.testStorage({ backend: 's3' })).resolves.toMatchObject({
			connected: true
		});
	});

	it('verifyMigration fills defaults and throws on error', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ passed: true }));
		await expect(admin.verifyMigration(10)).resolves.toMatchObject({
			passed: true,
			sample_checked: 0
		});
		fetchMock.mockImplementation(async () => jsonRes({}, 500));
		await expect(admin.verifyMigration()).rejects.toThrow(/verify failed/);
	});

	it('installPlugin posts a FormData bundle', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ id: 'com.example.hello' }));
		const file = new File([new Uint8Array([1, 2, 3])], 'p.zip', { type: 'application/zip' });
		await admin.installPlugin(file);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/admin/plugins',
			expect.objectContaining({ method: 'POST' })
		);
	});
});
