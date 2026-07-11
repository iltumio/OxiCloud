/** Sharing (ReBAC grants) endpoints — ported from model/grants.js. */
import { api } from '$lib/api';
import { ensureData, throwFailed } from '$lib/api/http';
import type { GrantsFeedQuery } from '$lib/api/paths.sharing';
import type { ItemType } from '$lib/api/types';
import type { ResourceBody, ResourcePage } from './resources';

/**
 * Resource kinds the `/api/grants` family addresses. File/folder grants flow
 * through the cascade engine; drive grants flow through
 * `DriveManagementService` server-side, which layers personal-drive guard +
 * last-owner protection on top of the same role-grant write. Either way the
 * wire shape is identical, so the FE helpers below accept all three.
 */
export type GrantResourceType = ItemType | 'drive';

export type SubjectType = 'user' | 'group' | 'email' | 'token';
/** Roles the share UI exposes. The backend role enum also has `commenter` and
 * `contributor`, which {@link displayRole} collapses to the nearest of these. */
export type ShareRole = 'viewer' | 'editor' | 'owner';

export interface GrantSubject {
	type: SubjectType;
	id: string;
}

/**
 * Subject shape accepted by `POST /api/grants`. The `email` variant feeds the
 * invite-by-email flow — the server resolves it to (or provisions) an external
 * user. Mirrors the backend `SubjectInputDto`.
 */
export type GrantSubjectInput =
	| { type: 'user'; id: string }
	| { type: 'group'; id: string }
	| { type: 'token'; id: string }
	| { type: 'email'; email: string };

/**
 * One role grant for a (subject, resource). Role-keyed since the role-grants
 * migration: each row carries an explicit `role` (the backend enum, which may
 * be `owner`/`editor`/`viewer`/`commenter`/`contributor`).
 */
export interface Grant {
	id: string;
	granted_at?: string;
	granted_by?: string;
	subject: GrantSubject;
	role: string;
	resource: { type: GrantResourceType; id: string };
	expires_at?: string | null;
}

// ── Notification outcomes (PR N1/N2) ─────────────────────────────────────────

export interface NotifyOutcome {
	kind: 'sent' | 'coalesced' | 'rate_limited' | 'not_applicable';
	detail?: string;
	last_sent_at?: string;
	retry_after_secs?: number;
	reason?: string;
}

export interface NotifyOutcomeSet {
	total_recipients: number;
	outcomes: NotifyOutcome[];
}

export interface CreateGrantResponse {
	grants: Grant[];
	notification: NotifyOutcomeSet;
}

/**
 * Map a backend role string to the role the UI exposes. The server may emit the
 * full enum (`owner`/`editor`/`viewer`/`commenter`/`contributor`); the picker
 * only shows Owner/Editor/Viewer, so collapse the two unexposed roles to their
 * closest neighbour rather than render an unknown option.
 */
export function displayRole(role: string | undefined): ShareRole {
	if (role === 'owner' || role === 'editor' || role === 'viewer') return role;
	if (role === 'contributor') return 'editor';
	if (role === 'commenter') return 'viewer';
	return 'viewer';
}

/** Convert a YYYY-MM-DD date (or null) to an ISO-8601 datetime at midnight UTC. */
export function expiryToIso(date: string | null | undefined): string | null {
	return date ? new Date(`${date}T00:00:00Z`).toISOString() : null;
}

export async function fetchGrantsForResource(
	type: GrantResourceType,
	id: string
): Promise<Grant[]> {
	const { data, response } = await api.GET('/api/grants', {
		params: { query: { resource_type: type, resource_id: id } }
	});
	return ensureData(data, response, '/api/grants');
}

export async function createGrant(
	subject: GrantSubjectInput,
	resource: { type: GrantResourceType; id: string },
	role: ShareRole,
	expiresAt?: string | null
): Promise<CreateGrantResponse> {
	const { data, error, response } = await api.POST('/api/grants', {
		body: { subject, resource, role, expires_at: expiresAt ?? null }
	});
	if (!response.ok || !data) throwFailed('create grant', response, error);
	return data;
}

export async function updateGrantRole(
	subject: GrantSubject,
	resource: { type: GrantResourceType; id: string },
	role: ShareRole,
	expiresAt?: string | null
): Promise<void> {
	const { response } = await api.PUT('/api/grants/role', {
		body: { subject, resource, role, expires_at: expiresAt ?? null }
	});
	if (!response.ok) throwFailed('update role', response);
}

export async function revokeGrant(grantId: string): Promise<void> {
	const { response } = await api.DELETE('/api/grants/{id}', {
		params: { path: { id: grantId } }
	});
	if (!response.ok) throwFailed('revoke grant', response);
}

/**
 * Resend / send a share notification for a single grant.
 * `POST /api/grants/{id}/notify`. Returns the aggregated outcome set, or a
 * `rate_limited` summary when the whole call was rate-limited (HTTP 429).
 */
export async function notifyGrantRecipient(grantId: string): Promise<NotifyOutcomeSet> {
	const { data, response } = await api.POST('/api/grants/{id}/notify', {
		params: { path: { id: grantId } }
	});
	if (response.status === 204) return { total_recipients: 0, outcomes: [] };
	if (response.status === 429) {
		return { total_recipients: 1, outcomes: [{ kind: 'rate_limited' }] };
	}
	if (response.ok && data) return data;
	throw new Error(`notify failed: ${response.status}`);
}

export interface IncomingGrantItem {
	resource_type: GrantResourceType;
	resource: ResourceBody;
	granted_by?: string;
	granted_at?: string;
	role?: string;
}

/** One (subject, permissions) entry within an outgoing resource item. */
export interface OutgoingResourceGrant {
	grant_id: string;
	subject_type: 'user' | 'group' | 'token';
	subject_id: string;
	subject_display: string;
	role: ShareRole;
	granted_at: string;
	expires_at?: string | null;
	has_password: boolean;
	is_external: boolean;
}

export interface OutgoingGrantItem {
	resource_type: GrantResourceType;
	resource: ResourceBody;
	first_shared_at?: string;
	/** One entry per (subject, permissions) pair. */
	grants: OutgoingResourceGrant[];
}

interface GrantsPageOpts {
	cursor?: string;
	orderBy?: string;
	limit?: number;
	reverse?: boolean;
	resourceTypes?: ItemType[];
}

function feedQuery(opts: GrantsPageOpts): GrantsFeedQuery {
	const { cursor, orderBy, limit = 50, reverse = false, resourceTypes } = opts;
	return {
		limit,
		...(resourceTypes?.length ? { resource_types: resourceTypes.join(',') } : {}),
		...(cursor ? { cursor } : {}),
		...(orderBy ? { sort_by: orderBy } : {}),
		...(reverse ? { reverse: true } : {})
	};
}

export async function fetchSharedWithMe(
	opts: GrantsPageOpts = {}
): Promise<ResourcePage<IncomingGrantItem>> {
	const { data, response } = await api.GET('/api/grants/incoming/resources', {
		params: { query: feedQuery({ resourceTypes: ['file', 'folder'], ...opts }) }
	});
	if (!response.ok || !data) throw new Error(`shared-with-me failed: ${response.status}`);
	return data;
}

export async function fetchMyShares(
	opts: GrantsPageOpts = {}
): Promise<ResourcePage<OutgoingGrantItem>> {
	const { data, response } = await api.GET('/api/grants/outgoing/resources', {
		params: { query: feedQuery(opts) }
	});
	if (!response.ok || !data) throw new Error(`my-shares failed: ${response.status}`);
	return data;
}
