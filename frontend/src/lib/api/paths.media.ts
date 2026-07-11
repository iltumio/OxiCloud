/**
 * Hand-authored path typings — music playlists, People (faces) and the Photos
 * timeline / Places map. Part of `ExtraPaths` (see `$lib/api/paths.ts`).
 */

import type { MusicShare, Playlist, PlaylistItem, PlaylistUpdate } from './endpoints/music';
import type { Person } from './endpoints/people';
import type { GeoCluster, PhotoItem } from './endpoints/photos';
import type {
	EmptyResponse,
	JsonOp,
	JsonResponse,
	Op,
	PathEntry,
	PathParams,
	QueryParams,
	RequiredQueryParams
} from './paths.shared';

export interface MediaPaths {
	'/api/playlists': PathEntry<{
		get: Op<{ 200: JsonResponse<Playlist[]> }>;
		post: JsonOp<
			{ name: string; description: string | null },
			{ 200: JsonResponse<Playlist>; 201: JsonResponse<Playlist> }
		>;
	}>;
	'/api/playlists/{id}': PathEntry<{
		put: JsonOp<PlaylistUpdate, { 200: EmptyResponse }, PathParams<{ id: string }>>;
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/playlists/{id}/tracks': PathEntry<{
		get: Op<{ 200: JsonResponse<PlaylistItem[]> }, PathParams<{ id: string }>>;
		post: JsonOp<
			{ file_ids: string[] },
			{ 200: EmptyResponse; 201: EmptyResponse },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/playlists/{id}/tracks/{file_id}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse },
			PathParams<{ id: string; file_id: string }>
		>;
	}>;
	'/api/playlists/{id}/reorder': PathEntry<{
		put: JsonOp<{ item_ids: string[] }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/playlists/{id}/shares': PathEntry<{
		get: Op<{ 200: JsonResponse<MusicShare[]> }, PathParams<{ id: string }>>;
	}>;
	'/api/playlists/{id}/share': PathEntry<{
		post: JsonOp<
			{ user_id: string; can_write: boolean },
			{ 200: EmptyResponse; 201: EmptyResponse },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/playlists/{id}/share/{user_id}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse },
			PathParams<{ id: string; user_id: string }>
		>;
	}>;
	'/api/people': PathEntry<{
		get: Op<{ 200: JsonResponse<Person[]>; 404: EmptyResponse }>;
	}>;
	'/api/people/{id}': PathEntry<{
		patch: JsonOp<{ name: string | null }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/people/{id}/photos': PathEntry<{
		get: Op<{ 200: JsonResponse<string[]> }, PathParams<{ id: string }>>;
	}>;
	'/api/photos': PathEntry<{
		get: Op<{ 200: JsonResponse<PhotoItem[]> }, QueryParams<{ limit?: number; before?: string }>>;
	}>;
	'/api/photos/geo': PathEntry<{
		get: Op<
			{ 200: JsonResponse<GeoCluster[]>; 404: EmptyResponse },
			RequiredQueryParams<{ bbox: string; zoom: number }>
		>;
	}>;
}
