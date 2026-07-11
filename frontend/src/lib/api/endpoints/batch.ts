/**
 * Batch operations (/api/batch/*). Used for multi-item copy — move and delete
 * already have per-item endpoints the files view loops over, but copy only
 * exists as a batch endpoint on the backend.
 */
import { api } from '$lib/api';
import { throwFailed } from '$lib/api/http';

export async function copyFiles(fileIds: string[], targetFolderId: string | null): Promise<void> {
	if (fileIds.length === 0) return;
	const { error, response } = await api.POST('/api/batch/files/copy', {
		body: { file_ids: fileIds, target_folder_id: targetFolderId }
	});
	if (!response.ok) throwFailed('/api/batch/files/copy', response, error);
}

export async function copyFolders(
	folderIds: string[],
	targetFolderId: string | null
): Promise<void> {
	if (folderIds.length === 0) return;
	const { error, response } = await api.POST('/api/batch/folders/copy', {
		body: { folder_ids: folderIds, target_folder_id: targetFolderId }
	});
	if (!response.ok) throwFailed('/api/batch/folders/copy', response, error);
}
