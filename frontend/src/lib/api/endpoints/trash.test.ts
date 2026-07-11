import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));

import { apiFetch } from '$lib/api/client';
import {
	expiryChip,
	remainingDaysBucket,
	restoreTrashItem,
	deleteTrashItem,
	emptyTrash
} from './trash';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const fetchMock = vi.mocked(apiFetch);
const DAY = 86_400_000;

describe('expiryChip', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('returns the matching tier for each time horizon', () => {
		expect(expiryChip(null).tier).toBe('never');
		expect(expiryChip(Date.now() - DAY).tier).toBe('expired');
		expect(expiryChip(Date.now() + DAY / 2).tier).toBe('urgent'); // today
		expect(expiryChip(Date.now() + 1.5 * DAY).tier).toBe('urgent'); // tomorrow
		expect(expiryChip(Date.now() + 4 * DAY).tier).toBe('soon');
		expect(expiryChip(Date.now() + 20 * DAY).tier).toBe('caution');
		expect(expiryChip(Date.now() + 100 * DAY).tier).toBe('normal');
	});
	it('renders an unparseable value as a normal chip', () => {
		expect(expiryChip('garbage').tier).toBe('normal');
	});
});

describe('remainingDaysBucket', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());
	it('produces a label for no-expiry, expired, and future', () => {
		expect(remainingDaysBucket(null)).toBeTruthy();
		expect(remainingDaysBucket(Date.now() - DAY)).toBeTruthy();
		expect(remainingDaysBucket(Date.now() + 10 * DAY)).toBeTruthy();
	});
});

describe('trash mutations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockImplementation(async () => jsonRes({}));
	});
	it('call the API for restore/delete/empty', async () => {
		await restoreTrashItem('t1').catch(() => {});
		await deleteTrashItem('t1').catch(() => {});
		await emptyTrash().catch(() => {});
		expect(fetchMock).toHaveBeenCalledTimes(3);
		const urls = fetchMock.mock.calls.map(([input]) => (input as Request).url);
		expect(urls[0]).toContain('/api/trash/t1/restore');
		expect(urls[1]).toContain('/api/trash/t1');
		expect(urls[2]).toContain('/api/trash/empty');
	});
	it('emptyTrash throws on a failed response', async () => {
		fetchMock.mockImplementation(async () => jsonRes({}, 500));
		await expect(emptyTrash()).rejects.toThrow();
	});
});
