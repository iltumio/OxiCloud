/** Group (ReBAC) endpoints — ported from model/groups.js. */
import { api } from '$lib/api';
import { ensureData, throwFailed } from '$lib/api/http';
import { t } from '$lib/i18n/index.svelte';

/**
 * Well-known UUID of the predefined "Internal" virtual group (matches the
 * Rust constant `INTERNAL_GROUP_ID` in `src/domain/entities/subject_group.rs`
 * and the legacy `model/groups.js`).
 */
export const INTERNAL_GROUP_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Map of well-known virtual-group UUIDs → i18n key for the human-readable
 * display name. Anything not in this map falls back to `group.name`. Ported
 * from `components/groupDisplay.js`.
 */
const VIRTUAL_NAME_KEYS: Record<string, string> = {
	[INTERNAL_GROUP_ID]: 'groups.virtual_internal_name'
};

/**
 * Map of well-known virtual-group UUIDs → i18n key for a human-readable
 * description. Virtual groups are server-seeded and their `description` column
 * holds developer/schema notes (e.g. the Internal group's "…no rows in
 * subject_group_members."), which must never reach end users — so virtual
 * groups display a localized blurb instead of their raw `description`.
 */
const VIRTUAL_DESC_KEYS: Record<string, string> = {
	[INTERNAL_GROUP_ID]: 'groups.virtual_internal_explanation'
};

export interface GroupItem {
	id: string;
	name: string;
	description?: string | null;
	member_count?: number;
	is_virtual?: boolean;
	can_manage?: boolean;
}

/** The members endpoint returns a tagged union: `{ kind: 'user' | 'group', id }`. */
export interface GroupMember {
	kind: 'user' | 'group';
	id: string;
}

/** A single page of groups plus the server-reported total (for "Load more"). */
export interface GroupPage {
	items: GroupItem[];
	total: number;
}

/**
 * Fetch one page of groups. The list endpoint may return an array or
 * `{ groups | items, total }`. When no total is provided we fall back to the
 * page length so pagination collapses gracefully to a single page.
 */
export async function listGroupsPage(limit = 50, offset = 0, q?: string): Promise<GroupPage> {
	const { data: raw, response } = await api.GET('/api/groups', {
		params: { query: { limit, offset, ...(q ? { q } : {}) } }
	});
	const data = ensureData(raw, response, '/api/groups');
	if (Array.isArray(data)) return { items: data, total: offset + data.length };
	const items = data.groups ?? data.items ?? [];
	return { items, total: data.total ?? offset + items.length };
}

/** Convenience wrapper returning just the items of the first page. */
export async function listGroups(limit = 50, offset = 0, q?: string): Promise<GroupItem[]> {
	return (await listGroupsPage(limit, offset, q)).items;
}

/**
 * Human-readable display name for a group. Virtual groups get a translated
 * label via the well-known UUID mapping; user-defined groups display their
 * raw name. Ported from `components/groupDisplay.js`.
 */
export function groupDisplayName(group: GroupItem): string {
	if (group.is_virtual) {
		const key = VIRTUAL_NAME_KEYS[group.id];
		if (key) return t(key, group.name);
	}
	return group.name;
}

/**
 * Human-readable description for a group row. Virtual groups render a localized
 * blurb (via the well-known UUID mapping) so their internal DB schema notes
 * never leak to the UI; a virtual group without a mapped key shows nothing.
 * User-defined groups display their raw `description` verbatim.
 */
export function groupDescription(group: GroupItem): string | null {
	if (group.is_virtual) {
		const key = VIRTUAL_DESC_KEYS[group.id];
		return key ? t(key, group.name) : null;
	}
	return group.description ?? null;
}

/**
 * Pick the icon registry name for a group avatar. Virtual (system-wide)
 * groups use `people-roof`; user-defined groups use `user-group`. Ported from
 * `components/groupDisplay.js`.
 */
export function groupIconName(group: Pick<GroupItem, 'is_virtual'>): string {
	return group.is_virtual ? 'people-roof' : 'user-group';
}

export async function createGroup(name: string, description?: string | null): Promise<void> {
	const { response } = await api.POST('/api/groups', {
		body: { name, description: description ?? null }
	});
	if (!response.ok) throwFailed('POST /api/groups', response);
}

export async function renameGroup(id: string, name: string): Promise<void> {
	const { response } = await api.PATCH('/api/groups/{id}', {
		params: { path: { id } },
		body: { name }
	});
	if (!response.ok) throwFailed(`PATCH /api/groups/${id}`, response);
}

export async function deleteGroup(id: string): Promise<void> {
	const { response } = await api.DELETE('/api/groups/{id}', { params: { path: { id } } });
	if (!response.ok) throwFailed(`DELETE /api/groups/${id}`, response);
}

export async function listMembers(id: string): Promise<GroupMember[]> {
	const { data, response } = await api.GET('/api/groups/{id}/members', {
		params: { path: { id } }
	});
	return ensureData(data, response, `/api/groups/${id}/members`);
}

export async function addUserMember(groupId: string, userId: string): Promise<void> {
	const { response } = await api.POST('/api/groups/{id}/members', {
		params: { path: { id: groupId } },
		body: { user_id: userId }
	});
	if (!response.ok) throwFailed(`POST /api/groups/${groupId}/members`, response);
}

/** Add another group as a nested member. Backend enforces cycle + depth limits. */
export async function addGroupMember(groupId: string, memberGroupId: string): Promise<void> {
	const { response } = await api.POST('/api/groups/{id}/members', {
		params: { path: { id: groupId } },
		body: { group_id: memberGroupId }
	});
	if (!response.ok) throwFailed(`POST /api/groups/${groupId}/members`, response);
}

export async function removeUserMember(groupId: string, userId: string): Promise<void> {
	const { response } = await api.DELETE('/api/groups/{id}/members/user/{user_id}', {
		params: { path: { id: groupId, user_id: userId } }
	});
	if (!response.ok) throwFailed(`DELETE /api/groups/${groupId}/members/user/${userId}`, response);
}

export async function removeGroupMember(groupId: string, memberGroupId: string): Promise<void> {
	const { response } = await api.DELETE('/api/groups/{id}/members/group/{group_id}', {
		params: { path: { id: groupId, group_id: memberGroupId } }
	});
	if (!response.ok) {
		throwFailed(`DELETE /api/groups/${groupId}/members/group/${memberGroupId}`, response);
	}
}
