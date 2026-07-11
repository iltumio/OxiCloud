/**
 * Hand-authored path typings — files, folders, dedup, batch ops, search and
 * WOPI. Part of `ExtraPaths` (see `$lib/api/paths.ts`).
 */

import type { FileItem, FolderItem, ItemType, SearchResults } from './types';
import type { BatchTrashResult, FileMetadata } from './endpoints/photos';
import type { SearchSuggestions } from './endpoints/search';
import type { WopiEditorData } from './endpoints/wopi';
import type {
	BinaryResponse,
	EmptyResponse,
	JsonOp,
	JsonResponse,
	MultipartOp,
	Op,
	PathAndQueryParams,
	PathEntry,
	PathParams,
	RequiredQueryParams
} from './paths.shared';

/** One row of the cursor-paginated `/api/folders/{id}/resources` feed. */
export interface FolderResourceItem {
	resource_type: ItemType;
	resource: FolderItem | FileItem;
}

/** One page of the folder resources feed. */
export interface FolderResourcePage {
	items?: FolderResourceItem[];
	next_cursor?: string;
}

export interface FilesPaths {
	'/api/files/upload': PathEntry<{
		post: MultipartOp<
			{ folder_id?: string; file: string },
			{ 200: JsonResponse<FileItem>; 201: JsonResponse<FileItem> }
		>;
	}>;
	'/api/files/by-hash': PathEntry<{
		post: JsonOp<
			{ name: string; folder_id: string; hash: string },
			{ 201: JsonResponse<FileItem>; 404: EmptyResponse; 507: EmptyResponse }
		>;
	}>;
	'/api/dedup/check-batch': PathEntry<{
		post: JsonOp<{ hashes: string[] }, { 200: JsonResponse<{ owned?: string[] }> }>;
	}>;
	'/api/files/{id}': PathEntry<{
		get: Op<{ 200: BinaryResponse }, PathAndQueryParams<{ id: string }, { inline?: boolean }>>;
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/files/{id}/rename': PathEntry<{
		put: JsonOp<{ name: string }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/files/{id}/move': PathEntry<{
		put: JsonOp<{ folder_id: string | null }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/files/{id}/metadata': PathEntry<{
		get: Op<{ 200: JsonResponse<FileMetadata> }, PathParams<{ id: string }>>;
	}>;
	'/api/files/{id}/thumbnail/{size}': PathEntry<{
		get: Op<
			{ 200: BinaryResponse },
			PathParams<{ id: string; size: 'icon' | 'preview' | 'large' }>
		>;
	}>;
	'/api/folders': PathEntry<{
		post: JsonOp<{ name: string; parent_id: string | null }, { 201: JsonResponse<FolderItem> }>;
	}>;
	'/api/folders/{id}': PathEntry<{
		get: Op<{ 200: JsonResponse<FolderItem> }, PathParams<{ id: string }>>;
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/folders/{id}/rename': PathEntry<{
		put: JsonOp<{ name: string }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/folders/{id}/move': PathEntry<{
		put: JsonOp<{ parent_id: string | null }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/folders/{id}/resources': PathEntry<{
		get: Op<
			{ 200: JsonResponse<FolderResourcePage>; 403: EmptyResponse },
			PathAndQueryParams<
				{ id: string },
				{
					order_by?: string;
					limit?: number;
					cursor?: string;
					reverse?: boolean;
					force_refresh?: boolean;
				}
			>
		>;
	}>;
	'/api/folders/{id}/download': PathEntry<{
		get: Op<{ 200: BinaryResponse }, PathAndQueryParams<{ id: string }, { format?: 'zip' }>>;
	}>;
	'/api/batch/files/copy': PathEntry<{
		post: JsonOp<{ file_ids: string[]; target_folder_id: string | null }, { 200: EmptyResponse }>;
	}>;
	'/api/batch/folders/copy': PathEntry<{
		post: JsonOp<{ folder_ids: string[]; target_folder_id: string | null }, { 200: EmptyResponse }>;
	}>;
	'/api/batch/trash': PathEntry<{
		post: JsonOp<
			{ file_ids: string[]; folder_ids: string[] },
			{ 200: JsonResponse<BatchTrashResult>; 206: JsonResponse<BatchTrashResult> }
		>;
	}>;
	'/api/search': PathEntry<{
		get: Op<
			{ 200: JsonResponse<SearchResults> },
			RequiredQueryParams<{
				query: string;
				folder_id?: string;
				recursive?: boolean;
				/** Comma-separated file extensions (the backend splits on ','). */
				type?: string;
				min_size?: number;
				max_size?: number;
				created_after?: number;
				created_before?: number;
				modified_after?: number;
				modified_before?: number;
				limit?: number;
				offset?: number;
				sort_by?: string;
			}>
		>;
	}>;
	'/api/search/suggest': PathEntry<{
		get: Op<
			{ 200: JsonResponse<SearchSuggestions> },
			RequiredQueryParams<{ query: string; folder_id?: string; limit?: number }>
		>;
	}>;
	'/api/search/cache': PathEntry<{
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }>;
	}>;
	'/api/wopi/editor-url': PathEntry<{
		get: Op<
			{ 200: JsonResponse<WopiEditorData>; 422: EmptyResponse },
			RequiredQueryParams<{ file_id: string; action: 'edit' | 'view' }>
		>;
	}>;
}
