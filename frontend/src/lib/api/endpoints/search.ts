/** Search endpoint — ported from features/files/search.js. */
import { api } from '$lib/api';
import { ensureData } from '$lib/api/http';
import type { SearchResults, SortBy } from '$lib/api/types';

export interface SearchOptions {
	folderId?: string;
	recursive?: boolean;
	fileTypes?: string[];
	minSize?: number;
	maxSize?: number;
	/** Unix-seconds lower bound on created time. */
	createdAfter?: number;
	/** Unix-seconds upper bound on created time. */
	createdBefore?: number;
	/** Unix-seconds lower bound on modified time. */
	modifiedAfter?: number;
	/** Unix-seconds upper bound on modified time. */
	modifiedBefore?: number;
	limit?: number;
	offset?: number;
	sortBy?: SortBy;
}

export async function searchFiles(query: string, opts: SearchOptions = {}): Promise<SearchResults> {
	const { data, response } = await api.GET('/api/search', {
		params: {
			query: {
				query,
				...(opts.folderId ? { folder_id: opts.folderId } : {}),
				...(opts.recursive !== undefined ? { recursive: opts.recursive } : {}),
				// The backend expects a single comma-separated `type` param (it splits
				// on ','); one param per type would yield a "duplicate field" 400.
				...(opts.fileTypes?.length ? { type: opts.fileTypes.join(',') } : {}),
				...(opts.minSize != null ? { min_size: opts.minSize } : {}),
				...(opts.maxSize != null ? { max_size: opts.maxSize } : {}),
				...(opts.createdAfter != null ? { created_after: opts.createdAfter } : {}),
				...(opts.createdBefore != null ? { created_before: opts.createdBefore } : {}),
				...(opts.modifiedAfter != null ? { modified_after: opts.modifiedAfter } : {}),
				...(opts.modifiedBefore != null ? { modified_before: opts.modifiedBefore } : {}),
				limit: opts.limit ?? 100,
				offset: opts.offset ?? 0,
				sort_by: opts.sortBy ?? 'relevance'
			}
		}
	});
	return ensureData(data, response, '/api/search');
}

/** A single autocomplete suggestion returned by the lightweight suggest endpoint. */
export interface SearchSuggestions {
	suggestions: string[];
	query_time_ms: number;
}

export interface SuggestOptions {
	folderId?: string;
	limit?: number;
}

/**
 * Lightweight autocomplete suggestions from the backend `GET /api/search/suggest`
 * endpoint — name-only hints without the full search overhead.
 */
export async function searchSuggest(
	query: string,
	opts: SuggestOptions = {}
): Promise<SearchSuggestions> {
	const { data, response } = await api.GET('/api/search/suggest', {
		params: {
			query: {
				query,
				...(opts.folderId ? { folder_id: opts.folderId } : {}),
				...(opts.limit != null ? { limit: opts.limit } : {})
			}
		}
	});
	return ensureData(data, response, '/api/search/suggest');
}

/** Clear the server-side search cache (`DELETE /api/search/cache`). */
export async function clearSearchCache(): Promise<void> {
	const { response } = await api.DELETE('/api/search/cache');
	if (!response.ok) {
		throw new Error(`Failed to clear search cache: ${response.status} ${response.statusText}`);
	}
}
