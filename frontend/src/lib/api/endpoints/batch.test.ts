import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiFetch: vi.fn(),
	apiJson: vi.fn(),
	ApiError: class ApiError extends Error {},
	setSessionExpiredHandler: vi.fn()
}));
vi.mock('$lib/api/csrf', () => ({ getCsrfHeaders: () => ({}), getCsrfToken: () => '' }));

import { apiFetch } from '$lib/api/client';
import { copyFiles, copyFolders } from './batch';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const fetchMock = vi.mocked(apiFetch);

describe('batch copy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockImplementation(async () => jsonRes({}));
	});

	it('short-circuits on empty input', async () => {
		await copyFiles([], null);
		await copyFolders([], 'x');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('posts copy requests for files and folders', async () => {
		await copyFiles(['a'], 't');
		await copyFolders(['b'], null);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const first = fetchMock.mock.calls[0][0] as Request;
		expect(first.url).toContain('/api/batch/files/copy');
		expect(first.method).toBe('POST');
	});

	it('throws the server error/message on failure', async () => {
		fetchMock.mockImplementation(async () => jsonRes({ error: 'bad' }, 400));
		await expect(copyFiles(['a'], 't')).rejects.toThrow('bad');
		fetchMock.mockImplementation(async () => jsonRes({}, 500));
		await expect(copyFolders(['b'], 't')).rejects.toThrow(/failed: 500/);
	});
});
