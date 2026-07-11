/**
 * Per-user profile resolution via `GET /api/users/{id}`, cached per id.
 *
 * Used to render external (and any non-directory) users in share/recipient UIs
 * with their real name, email, avatar and an internal/external flag — the
 * system address book only lists internal users, so external grant subjects
 * would otherwise show as a bare UUID. Mirrors the original `systemUsers`
 * resolver. The endpoint enforces its own visibility rules; a non-visible
 * profile resolves to `null` so callers fall back to whatever label they have.
 */
import { api } from '$lib/api';

export interface ResolvedUser {
	id: string;
	name: string;
	email: string;
	image: string | null;
	isExternal: boolean;
}

/** Wire subset of the backend `UserDto` exposed by `GET /api/users/{id}`. */
export interface UserProfileDto {
	id: string;
	username?: string | null;
	email?: string | null;
	image?: string | null;
	is_external: boolean;
	given_name?: string;
	family_name?: string;
}

// id → in-flight/resolved lookup (the Promise is cached so concurrent callers
// for the same id share one request, and a `null` result isn't re-fetched).
const cache = new Map<string, Promise<ResolvedUser | null>>();

export function resolveUser(id: string): Promise<ResolvedUser | null> {
	const hit = cache.get(id);
	if (hit) return hit;

	const pending = (async (): Promise<ResolvedUser | null> => {
		try {
			const { data: u, response } = await api.GET('/api/users/{id}', {
				params: { path: { id } }
			});
			if (!response.ok || !u) return null;
			return {
				id: u.id,
				name: u.username?.trim() || u.email || u.id,
				email: u.email ?? '',
				image: u.image ?? null,
				isExternal: u.is_external
			};
		} catch {
			return null;
		}
	})();

	cache.set(id, pending);
	return pending;
}
