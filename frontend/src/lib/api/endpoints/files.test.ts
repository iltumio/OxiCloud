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
	uploadFile,
	renameFile,
	moveFile,
	deleteFile,
	fileDownloadUrl,
	fileInlineUrl
} from './files';

const jsonRes = (body: unknown = {}, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const f = vi.mocked(apiFetch);
describe('files endpoint URL builders', () => {
	it('build download/inline URLs', () => {
		expect(fileDownloadUrl('id1')).toContain('id1');
		expect(fileDownloadUrl('id1')).toContain('/api/files/');
		expect(fileInlineUrl('id1')).toContain('id1');
	});
});
describe('files endpoint mutations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		f.mockImplementation(async () => jsonRes({ id: 'x' }));
	});
	it('call the API for upload/rename/move/delete', async () => {
		const file = new File([new Uint8Array([1])], 'f.txt', { type: 'text/plain' });
		await uploadFile('fid', file).catch(() => {});
		await renameFile('id', 'new').catch(() => {});
		await moveFile('id', 'dest').catch(() => {});
		await deleteFile('id').catch(() => {});
		expect(f).toHaveBeenCalledTimes(4);
		// The plain upload stays on apiFetch(url, init); the rest go through the
		// typed client and arrive as Request objects.
		expect(f.mock.calls[0][0]).toBe('/api/files/upload');
		const rename = f.mock.calls[1][0] as Request;
		expect(rename.url).toContain('/api/files/id/rename');
		expect(rename.method).toBe('PUT');
	});
	it('throws with the status on failure', async () => {
		f.mockImplementation(async () => jsonRes({}, 500));
		await expect(renameFile('id', 'x')).rejects.toThrow(/rename file failed: 500/);
		await expect(deleteFile('id')).rejects.toThrow(/delete file failed: 500/);
	});
});
