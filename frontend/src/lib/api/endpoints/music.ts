/** Music / playlist endpoints — ported from features/library/music.js. */
import { api } from '$lib/api';
import { apiFetch } from '$lib/api/client';
import { getCsrfHeaders } from '$lib/api/csrf';
import { ensureData, throwFailed } from '$lib/api/http';
import { apiQueryOptions } from '$lib/api/query';

export interface Playlist {
	id: string;
	name: string;
	description: string | null;
	owner_id: string;
	is_public: boolean;
	cover_file_id: string | null;
	track_count: number;
	total_duration_secs: number;
	created_at: number;
	updated_at: number;
}

export interface PlaylistItem {
	id: string;
	playlist_id: string;
	file_id: string;
	position: number;
	added_at: number;
	file_name: string | null;
	file_size: number | null;
	mime_type: string | null;
	title: string | null;
	artist: string | null;
	album: string | null;
	duration_secs: number | null;
}

/** A user a playlist is shared with (`/api/playlists/{id}/shares`). */
export interface MusicShare {
	user_id: string;
	can_write: boolean | null;
}

/** Fields that can be patched on a playlist via PUT. */
export interface PlaylistUpdate {
	name?: string;
	description?: string | null;
	is_public?: boolean;
	cover_file_id?: string | null;
}

export async function listPlaylists(): Promise<Playlist[]> {
	const { data, response } = await api.GET('/api/playlists');
	return ensureData(data, response, '/api/playlists');
}

/** svelte-query options for {@link listPlaylists}. */
export function playlistsOptions() {
	return apiQueryOptions('get', '/api/playlists');
}

export async function listTracks(playlistId: string): Promise<PlaylistItem[]> {
	const { data, response } = await api.GET('/api/playlists/{id}/tracks', {
		params: { path: { id: playlistId } }
	});
	return ensureData(data, response, `/api/playlists/${playlistId}/tracks`);
}

export async function createPlaylist(name: string): Promise<Playlist> {
	const { data, response } = await api.POST('/api/playlists', {
		body: { name, description: null }
	});
	if (!response.ok || !data) throwFailed('create playlist', response);
	return data;
}

/** Patch one or more playlist fields (name, description, public flag, cover). */
export async function updatePlaylist(playlistId: string, patch: PlaylistUpdate): Promise<void> {
	const { response } = await api.PUT('/api/playlists/{id}', {
		params: { path: { id: playlistId } },
		body: patch
	});
	if (!response.ok) throwFailed('update playlist', response);
}

export function renamePlaylist(playlistId: string, name: string): Promise<void> {
	return updatePlaylist(playlistId, { name });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
	const { response } = await api.DELETE('/api/playlists/{id}', {
		params: { path: { id: playlistId } }
	});
	if (!response.ok) throwFailed('delete playlist', response);
}

export async function addTracks(playlistId: string, fileIds: string[]): Promise<void> {
	const { response } = await api.POST('/api/playlists/{id}/tracks', {
		params: { path: { id: playlistId } },
		body: { file_ids: fileIds }
	});
	if (!response.ok) throwFailed('add tracks', response);
}

export async function removeTrack(playlistId: string, fileId: string): Promise<void> {
	const { response } = await api.DELETE('/api/playlists/{id}/tracks/{file_id}', {
		params: { path: { id: playlistId, file_id: fileId } }
	});
	if (!response.ok) throwFailed('remove track', response);
}

/** Persist a new track order. `itemIds` are PlaylistItem ids in the desired order. */
export async function reorderTracks(playlistId: string, itemIds: string[]): Promise<void> {
	const { response } = await api.PUT('/api/playlists/{id}/reorder', {
		params: { path: { id: playlistId } },
		body: { item_ids: itemIds }
	});
	if (!response.ok) throwFailed('reorder', response);
}

export async function listShares(playlistId: string): Promise<MusicShare[]> {
	const { data, response } = await api.GET('/api/playlists/{id}/shares', {
		params: { path: { id: playlistId } }
	});
	return ensureData(data, response, `/api/playlists/${playlistId}/shares`);
}

export async function sharePlaylist(
	playlistId: string,
	userId: string,
	canWrite = false
): Promise<void> {
	const { response } = await api.POST('/api/playlists/{id}/share', {
		params: { path: { id: playlistId } },
		body: { user_id: userId, can_write: canWrite }
	});
	if (!response.ok) throwFailed('share playlist', response);
}

export async function removeShare(playlistId: string, userId: string): Promise<void> {
	const { response } = await api.DELETE('/api/playlists/{id}/share/{user_id}', {
		params: { path: { id: playlistId, user_id: userId } }
	});
	if (!response.ok) throwFailed('remove share', response);
}

/** Upload an image and return its new file id (used to set a playlist cover). */
export async function uploadCoverImage(file: File, folderId = ''): Promise<string> {
	const form = new FormData();
	form.append('file', file);
	form.append('folder_id', folderId);
	const res = await apiFetch('/api/files/upload', {
		method: 'POST',
		credentials: 'same-origin',
		headers: getCsrfHeaders(),
		body: form
	});
	if (!res.ok) throw new Error(`cover upload failed: ${res.status}`);
	const uploaded = (await res.json()) as { id?: string };
	if (!uploaded.id) throw new Error('cover upload returned no file id');
	return uploaded.id;
}
