import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));

import { apiFetch } from '$lib/api/client';
import { dateBucket, sizeBucket, typeLabel, addFavorite, removeFavorite } from './favorites';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const fetchMock = vi.mocked(apiFetch);

describe('dateBucket', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('buckets by recency and falls back to the year', () => {
		expect(dateBucket(Date.now())).toBeTruthy();
		expect(dateBucket(Date.now() - 3 * 86_400_000)).toBeTruthy();
		expect(dateBucket(Date.now() - 20 * 86_400_000)).toBeTruthy();
		expect(dateBucket('2019-06-15')).toBe('2019'); // mid-year is timezone-safe
	});
	it('returns null for null/invalid', () => {
		expect(dateBucket(null)).toBeNull();
		expect(dateBucket(undefined)).toBeNull();
		expect(dateBucket('not a date')).toBeNull();
	});
});

describe('sizeBucket', () => {
	it('maps byte ranges to distinct labels', () => {
		const labels = [
			sizeBucket(null),
			sizeBucket(0),
			sizeBucket(500),
			sizeBucket(50 * 1_048_576),
			sizeBucket(500 * 1_048_576),
			sizeBucket(2 * 1_073_741_824),
			sizeBucket(10 * 1_073_741_824)
		];
		expect(new Set(labels).size).toBe(labels.length); // all distinct
		labels.forEach((l) => expect(l).toBeTruthy());
	});
});

describe('typeLabel', () => {
	it('maps known categories and passes through unknown ones', () => {
		expect(typeLabel('PDF')).toBe('PDF');
		expect(typeLabel('Image')).toBeTruthy();
		expect(typeLabel('Weird')).toBe('Weird');
	});
});

describe('favorites mutations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockImplementation(async () => jsonRes({}));
	});
	it('addFavorite / removeFavorite call the API', async () => {
		await addFavorite('file', 'id1');
		await removeFavorite('file', 'id1');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [add, remove] = fetchMock.mock.calls.map(([input]) => input as Request);
		expect(add.url).toContain('/api/favorites/file/id1');
		expect(add.method).toBe('POST');
		expect(remove.method).toBe('DELETE');
	});
});
