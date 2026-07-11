/**
 * Recipient search for the share People tab — system users (via the system
 * address book) + groups (via /api/groups/search) + a synthesized "invite by
 * email" suggestion when the query parses as an email. Ported from the original
 * shareModal recipient autocomplete (addressBook.searchContacts + _searchGroups
 * + _looksLikeEmail).
 */
import { api } from '$lib/api';
import { session } from '$lib/stores/session.svelte';
import type { SubjectType } from './grants';

export interface Recipient {
	type: Extract<SubjectType, 'user' | 'group' | 'email'>;
	/** For email recipients this is the normalised email; for users/groups, the UUID. */
	id: string;
	label: string;
	sublabel?: string;
}

/** Wire shape of a system address-book contact (subset consumed here). */
export interface SystemContact {
	id: string;
	first_name?: string;
	last_name?: string;
	full_name?: string;
	email?: Array<{ email: string; is_primary?: boolean }>;
}

/**
 * Permissive client-side email check — matches a non-whitespace local part, an
 * `@`, and a domain with a dot. The server's `normalize_email` is authoritative;
 * this just decides whether to surface the synthetic invite-by-email row.
 */
function looksLikeEmail(q: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
}

// The system book lists all users; we filter client-side (matches the original).
// Two caches because the backend response differs (default excludes the caller,
// `?include_self=1` returns them). Keying by flag avoids one variant overwriting
// the other.
let contactCache: SystemContact[] | null = null;
let contactCacheWithSelf: SystemContact[] | null = null;
/** `false` once we confirm the system address book is unavailable. */
let directoryAvailable: boolean | null = null;

async function systemContacts(includeSelf = false): Promise<SystemContact[]> {
	const cached = includeSelf ? contactCacheWithSelf : contactCache;
	if (cached) return cached;
	try {
		// `?include_self=true` (not `=1`) — Axum's `Query` extractor uses
		// `serde_urlencoded`, which only deserialises `"true"`/`"false"`
		// for `bool`. Sending `=1` would 400 before the handler runs.
		const { data, response } = await api.GET('/api/address-books/system/contacts', {
			params: { query: includeSelf ? { include_self: true } : {} }
		});
		if (!response.ok || !data) {
			directoryAvailable = false;
			if (includeSelf) {
				contactCacheWithSelf = [];
				return contactCacheWithSelf;
			}
			contactCache = [];
			return contactCache;
		}
		directoryAvailable = true;
		if (includeSelf) contactCacheWithSelf = data;
		else contactCache = data;
		return data;
	} catch {
		directoryAvailable = false;
		if (includeSelf) {
			contactCacheWithSelf = [];
			return contactCacheWithSelf;
		}
		contactCache = [];
		return contactCache;
	}
}

/**
 * Whether the system user directory is reachable. Returns `true` until proven
 * otherwise so callers degrade gracefully; call `ensureResolvers()` first to
 * get an accurate answer.
 */
export function isDirectoryAvailable(): boolean {
	return directoryAvailable !== false;
}

function contactLabel(c: SystemContact): { label: string; email: string } {
	const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || '';
	const email = c.email?.find((e) => e.is_primary)?.email ?? c.email?.[0]?.email ?? '';
	return { label: name || email || c.id, email };
}

async function searchGroups(q: string): Promise<Recipient[]> {
	try {
		const { data, response } = await api.GET('/api/groups/search', {
			params: { query: { q, limit: 8 } }
		});
		if (!response.ok || !data) return [];
		return data.map((g) => ({ type: 'group' as const, id: g.id, label: g.name }));
	} catch {
		return [];
	}
}

// ── Label resolution for existing grants (subject id → display name) ────────
let groupCache: Map<string, string> | null = null;

async function loadGroups(): Promise<Map<string, string>> {
	if (groupCache) return groupCache;
	groupCache = new Map();
	try {
		const { data, response } = await api.GET('/api/groups/search', {
			params: { query: { q: '', limit: 200 } }
		});
		if (response.ok && data) {
			for (const g of data) groupCache.set(g.id, g.name);
		}
	} catch {
		/* leave empty */
	}
	return groupCache;
}

/** Preload the user + group caches so grant rows can show names. */
export async function ensureResolvers(): Promise<void> {
	await Promise.all([systemContacts(), loadGroups()]);
}

/** Resolve a subject id to a display label using the preloaded caches. */
export function resolveLabel(type: 'user' | 'group', id: string): string {
	if (type === 'group') return groupCache?.get(id) ?? id;
	const c = contactCache?.find((x) => x.id === id);
	return c ? contactLabel(c).label : id;
}

/** Resolve a subject id to a label + sublabel (email) for member vignettes. */
export function resolveRecipient(type: 'user' | 'group', id: string): Recipient {
	if (type === 'group') {
		return { type: 'group', id, label: groupCache?.get(id) ?? id };
	}
	const c = contactCache?.find((x) => x.id === id);
	if (!c) return { type: 'user', id, label: id };
	const { label, email } = contactLabel(c);
	return { type: 'user', id, label, sublabel: email };
}

/**
 * Combined user + group results matching the query (case-insensitive), plus a
 * synthetic invite-by-email suggestion when the query is an email that no
 * contact already owns. Capped at 8 combined (groups, then users, then email).
 *
 * `includeSelf` defaults to `false` — the share modal excludes the current
 * caller from the picker because "you can't share with yourself". The admin
 * drive-owners surface flips it on: an admin legitimately needs to add
 * themselves (or anyone) as Owner without that personal-share restriction.
 */
export async function searchRecipients(
	query: string,
	{ includeSelf = false }: { includeSelf?: boolean } = {}
): Promise<Recipient[]> {
	const q = query.toLowerCase().trim();
	if (!q) return [];
	const currentUserId = session.user?.id ?? null;
	const [contacts, groups] = await Promise.all([systemContacts(includeSelf), searchGroups(q)]);
	const matched = contacts
		.filter((c) => includeSelf || c.id !== currentUserId)
		.map((c) => ({ c, ...contactLabel(c) }))
		.filter(
			({ label, email }) => label.toLowerCase().includes(q) || email.toLowerCase().includes(q)
		);
	const users: Recipient[] = matched.map(({ c, label, email }) => ({
		type: 'user' as const,
		id: c.id,
		label,
		sublabel: email
	}));

	const emailItems: Recipient[] = [];
	if (looksLikeEmail(q)) {
		const exists = matched.some(({ email }) => email.toLowerCase() === q);
		if (!exists) emailItems.push({ type: 'email', id: q, label: q });
	}

	return [...groups, ...users, ...emailItems].slice(0, 8);
}
