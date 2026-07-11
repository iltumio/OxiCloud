import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));

import { apiFetch } from '$lib/api/client';
import {
	displayRole,
	expiryToIso,
	createGrant,
	updateGrantRole,
	revokeGrant,
	notifyGrantRecipient
} from './grants';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const fetchMock = vi.mocked(apiFetch);

describe('displayRole', () => {
	it('passes through canonical roles', () => {
		expect(displayRole('owner')).toBe('owner');
		expect(displayRole('editor')).toBe('editor');
		expect(displayRole('viewer')).toBe('viewer');
	});
	it('maps legacy roles and defaults to viewer', () => {
		expect(displayRole('contributor')).toBe('editor');
		expect(displayRole('commenter')).toBe('viewer');
		expect(displayRole('mystery')).toBe('viewer');
		expect(displayRole(undefined)).toBe('viewer');
	});
});

describe('expiryToIso', () => {
	it('converts a date to an ISO string at UTC midnight', () => {
		expect(expiryToIso('2030-01-02')).toBe('2030-01-02T00:00:00.000Z');
	});
	it('returns null for empty input', () => {
		expect(expiryToIso(null)).toBeNull();
		expect(expiryToIso(undefined)).toBeNull();
		expect(expiryToIso('')).toBeNull();
	});
});

describe('grant mutations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockImplementation(async () => jsonRes({}));
	});
	it('call the API for create/update/revoke/notify', async () => {
		await createGrant(
			{ type: 'user', id: 'u1' },
			{ type: 'folder', id: 'rid' },
			'viewer',
			null
		).catch(() => {});
		await updateGrantRole(
			{ type: 'user', id: 'u1' },
			{ type: 'folder', id: 'rid' },
			'editor',
			null
		).catch(() => {});
		await revokeGrant('g1').catch(() => {});
		await notifyGrantRecipient('g1').catch(() => {});
		expect(fetchMock).toHaveBeenCalledTimes(4);
		const urls = fetchMock.mock.calls.map(([input]) => (input as Request).url);
		expect(urls[0]).toContain('/api/grants');
		expect(urls[2]).toContain('/api/grants/g1');
		expect(urls[3]).toContain('/api/grants/g1/notify');
	});
	it('notifyGrantRecipient maps 204 and 429 to summary outcomes', async () => {
		fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
		await expect(notifyGrantRecipient('g1')).resolves.toEqual({
			total_recipients: 0,
			outcomes: []
		});
		fetchMock.mockImplementation(async () => jsonRes({}, 429));
		await expect(notifyGrantRecipient('g1')).resolves.toEqual({
			total_recipients: 1,
			outcomes: [{ kind: 'rate_limited' }]
		});
	});
});
