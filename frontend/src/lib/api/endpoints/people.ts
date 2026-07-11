/** People (faces) endpoints — ported from features/library/people.js. */
import { api } from '$lib/api';
import { throwFailed } from '$lib/api/http';
import { apiQueryOptions } from '$lib/api/query';

/** An identity cluster from `GET /api/people`. */
export interface Person {
	id: string;
	/** Absent until the user names the person. */
	name?: string;
	/** File id of the cover face's photo, for the tile thumbnail. */
	cover_file_id?: string;
	face_count: number;
	is_hidden: boolean;
}

/**
 * List identity clusters. The feature is gated on `OXICLOUD_ENABLE_FACES` —
 * when it is off the route 404s; callers treat that as "faces disabled".
 */
export async function fetchPeople(): Promise<Person[]> {
	const { data, response } = await api.GET('/api/people');
	if (!response.ok || !data) throw new Error(`people failed: ${response.status}`);
	return data;
}

/** svelte-query options for {@link fetchPeople}. */
export function peopleOptions() {
	return apiQueryOptions('get', '/api/people');
}

/**
 * Probe whether the People feature is available (faces enabled). Used to reveal
 * the People tab only when the backend can serve it.
 */
export async function peopleEnabled(): Promise<boolean> {
	try {
		const { response } = await api.GET('/api/people');
		return response.ok;
	} catch {
		return false;
	}
}

/** File ids of the photos a person appears in. */
export async function fetchPersonPhotos(personId: string): Promise<string[]> {
	const { data, response } = await api.GET('/api/people/{id}/photos', {
		params: { path: { id: personId } }
	});
	if (!response.ok || !data) throw new Error(`person photos failed: ${response.status}`);
	return data;
}

/** Rename a person, or pass `null` to clear the name. */
export async function renamePerson(personId: string, name: string | null): Promise<void> {
	const { response } = await api.PATCH('/api/people/{id}', {
		params: { path: { id: personId } },
		body: { name }
	});
	if (!response.ok) throwFailed('rename', response);
}
