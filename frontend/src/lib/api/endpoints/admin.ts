/**
 * Admin endpoints — ported from views/admin/admin.js. Covers users, plugins
 * (incl. logs/retention/live SSE tail), dashboard, settings (OIDC/storage/SMTP),
 * and storage migration (incl. the verify integrity check).
 */
import { api } from '$lib/api';
import { apiFetch } from '$lib/api/client';
import { getCsrfHeaders } from '$lib/api/csrf';
import { ensureData, throwFailed } from '$lib/api/http';
import type { Drive, DriveMember, DriveMemberSubject, DriveRole, User } from '$lib/api/types';

// ── Maintenance ───────────────────────────────────────────────────────────

/** Outcome of a bulk metadata re-extraction run. */
export interface ReextractResult {
	message: string;
	total: number;
	processed: number;
	failed: number;
}

/** Re-scan every audio file and backfill its tag metadata (idempotent). */
export async function reextractAudioMetadata(): Promise<ReextractResult> {
	const { data, error, response } = await api.POST('/api/admin/audio/metadata/reextract');
	if (!response.ok || !data) {
		throwFailed('POST /api/admin/audio/metadata/reextract', response, error);
	}
	return data;
}

/** Backfill EXIF / container capture dates for all media, re-bucketing the
 *  Photos timeline by real capture date (idempotent). */
export async function reextractPhotoMetadata(): Promise<ReextractResult> {
	const { data, error, response } = await api.POST('/api/admin/photos/metadata/reextract');
	if (!response.ok || !data) {
		throwFailed('POST /api/admin/photos/metadata/reextract', response, error);
	}
	return data;
}

/** A freshly generated AES-256 at-rest blob-encryption key (base64) plus a
 *  data-loss warning authored by the server. */
export interface GeneratedKey {
	key: string;
	warning: string;
}

/** Generate a random AES-256 key for at-rest blob encryption. */
export async function generateEncryptionKey(): Promise<GeneratedKey> {
	const { data, error, response } = await api.POST('/api/admin/settings/storage/generate-key');
	if (!response.ok || !data) {
		throwFailed('POST /api/admin/settings/storage/generate-key', response, error);
	}
	return data;
}

// ── Drives ──────────────────────────────────────────────────────────────

/**
 * `GET /api/admin/drives` — every drive on the system, admin-only.
 *
 * Distinct from `listDrives()` in `$lib/api/endpoints/drives`, which is
 * the caller's own listing (filtered through `role_grants`). An admin
 * who creates a shared drive for someone else has no role on it, so
 * the user-facing listing would skip it — this endpoint returns
 * everything for the admin panel's "Drives" tab.
 */
export async function listAllDrives(): Promise<Drive[]> {
	const { data, response } = await api.GET('/api/admin/drives');
	return ensureData(data, response, '/api/admin/drives');
}

/**
 * `GET /api/admin/drives/{id}/members` — every role grant on a drive,
 * admin-only. The user-facing `/api/drives/{id}/members` requires
 * `Permission::Read` on the drive; an admin who created the drive
 * for someone else has no role on it and would hit a 404 there. This
 * endpoint reuses `list_grants_on_resource` with the admin guard at
 * the route edge, so the same `DriveMember` shape comes back.
 */
export async function listDriveMembersAdmin(driveId: string): Promise<DriveMember[]> {
	const { data, response } = await api.GET('/api/admin/drives/{id}/members', {
		params: { path: { id: driveId } }
	});
	return ensureData(data, response, `/api/admin/drives/${driveId}/members`);
}

/**
 * `POST /api/admin/drives/{id}/members` — add (or refresh) a member as
 * an admin, bypassing the per-drive `Manage` check. Personal-drive
 * guard + last-owner protection still apply. Throws on non-2xx.
 */
export async function addDriveMemberAdmin(
	driveId: string,
	subject: DriveMemberSubject,
	role: DriveRole,
	expiresAt?: string | null
): Promise<DriveMember> {
	const { data, error, response } = await api.POST('/api/admin/drives/{id}/members', {
		params: { path: { id: driveId } },
		body: { subject, role, expires_at: expiresAt ?? null }
	});
	if (!response.ok || !data) throwFailed('add member', response, error);
	return data;
}

/**
 * `DELETE /api/admin/drives/{id}/members/{kind}/{sid}` — remove a
 * member as an admin. Idempotent (removing a non-member returns 204).
 * Last-owner protection still applies (400 with `reason='last_owner'`).
 */
export async function removeDriveMemberAdmin(
	driveId: string,
	subject: DriveMemberSubject
): Promise<void> {
	const { error, response } = await api.DELETE('/api/admin/drives/{id}/members/{kind}/{sid}', {
		params: { path: { id: driveId, kind: subject.type, sid: subject.id } }
	});
	if (!response.ok) throwFailed('remove member', response, error);
}

/**
 * `DELETE /api/admin/drives/{id}` — admin-only drive delete (D3b).
 *
 * Bypasses the per-drive `Manage` check (the admin guard at the route
 * edge is the access control). The default-personal-drive guard and
 * the "drive must be empty" check still fire server-side — admins
 * can't accidentally wipe a populated drive or a user's home folder.
 * Throws on non-2xx so the caller can branch on `405` (default
 * personal) vs `409` (non-empty) when surfacing the failure.
 */
export async function deleteDriveAdmin(driveId: string): Promise<void> {
	const { error, response } = await api.DELETE('/api/admin/drives/{id}', {
		params: { path: { id: driveId } }
	});
	// 405 / 409 carry actionable messages from the backend; bubble them.
	if (!response.ok) throwFailed('delete drive', response, error);
}

// ── Users ───────────────────────────────────────────────────────────────

export interface AdminUsersPage {
	total: number;
	users: User[];
}

export async function listUsers(limit: number, offset: number): Promise<AdminUsersPage> {
	const { data, response } = await api.GET('/api/admin/users', {
		params: { query: { limit, offset } }
	});
	return ensureData(data, response, '/api/admin/users');
}

export interface CreateUserInput {
	username: string;
	password: string;
	/** Optional — the backend auto-generates an address when null/empty. */
	email: string | null;
	role: string;
	quota_bytes: number;
}

export async function createUser(input: CreateUserInput): Promise<void> {
	const { error, response } = await api.POST('/api/admin/users', { body: input });
	if (!response.ok) throwFailed('POST /api/admin/users', response, error);
}

export async function setUserRole(userId: string, role: string): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/users/{id}/role', {
		params: { path: { id: userId } },
		body: { role }
	});
	if (!response.ok) throwFailed(`PUT /api/admin/users/${userId}/role`, response, error);
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/users/{id}/active', {
		params: { path: { id: userId } },
		body: { active }
	});
	if (!response.ok) throwFailed(`PUT /api/admin/users/${userId}/active`, response, error);
}

export async function setUserQuota(userId: string, quotaBytes: number): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/users/{id}/quota', {
		params: { path: { id: userId } },
		body: { quota_bytes: quotaBytes }
	});
	if (!response.ok) throwFailed(`PUT /api/admin/users/${userId}/quota`, response, error);
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/users/{id}/password', {
		params: { path: { id: userId } },
		body: { new_password: newPassword }
	});
	if (!response.ok) throwFailed(`PUT /api/admin/users/${userId}/password`, response, error);
}

export async function deleteUser(userId: string): Promise<void> {
	const { error, response } = await api.DELETE('/api/admin/users/{id}', {
		params: { path: { id: userId } }
	});
	if (!response.ok) throwFailed(`DELETE /api/admin/users/${userId}`, response, error);
}

// ── Dashboard ───────────────────────────────────────────────────────────

export interface AdminDashboard {
	total_users: number;
	active_users: number;
	admin_users: number;
	server_version: string;
	total_used_bytes: number;
	total_quota_bytes: number;
	storage_usage_percent: number;
	auth_enabled: boolean;
	oidc_configured: boolean;
	quotas_enabled: boolean;
	registration_enabled?: boolean;
	users_over_80_percent: number;
	users_over_quota: number;
}

export async function getDashboard(): Promise<AdminDashboard> {
	const { data, response } = await api.GET('/api/admin/dashboard');
	return ensureData(data, response, '/api/admin/dashboard');
}

export async function setRegistrationEnabled(enabled: boolean): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/settings/registration', {
		body: { registration_enabled: enabled }
	});
	if (!response.ok) throwFailed('PUT /api/admin/settings/registration', response, error);
}

// ── SMTP ────────────────────────────────────────────────────────────────

export interface SmtpInfo {
	enabled: boolean;
	host: string;
	port: number;
	tls: string;
	from: string;
	user_state: string;
}

export async function getSmtpInfo(): Promise<SmtpInfo> {
	const { data, response } = await api.GET('/api/admin/smtp/info');
	return ensureData(data, response, '/api/admin/smtp/info');
}

export interface SmtpTestResult {
	success: boolean;
	code?: string | number;
	message?: string;
	error?: string;
}

/** Result of POST .../settings/storage/test — the S3 connection probe. */
export interface StorageTestResult {
	connected?: boolean;
	success?: boolean;
	backend_type?: string;
	available_bytes?: number | null;
	message?: string;
}

export async function sendSmtpTest(to: string): Promise<SmtpTestResult> {
	const { data, error, response } = await api.POST('/api/admin/smtp/test', { body: { to } });
	if (response.status === 503) {
		return { success: false, message: 'SMTP is not configured on this server.' };
	}
	// The probe reports failure as a JSON body (parsed into `error` on non-2xx).
	return data ?? asResult<SmtpTestResult>(error) ?? { success: false };
}

/** Narrow a parsed non-2xx JSON body to the probe-result shape, else null. */
function asResult<T extends object>(error: unknown): T | null {
	return typeof error === 'object' && error !== null ? (error as T) : null;
}

// ── OIDC settings ─────────────────────────────────────────────────────────

export interface OidcSettings {
	enabled: boolean;
	issuer_url: string;
	client_id: string;
	scopes: string | null;
	auto_provision: boolean;
	admin_groups: string | null;
	disable_password_login: boolean;
	provider_name: string | null;
	callback_url?: string;
	client_secret_set?: boolean;
	env_overrides?: string[];
}

export interface OidcTestResult {
	success: boolean;
	message: string;
	issuer?: string;
	authorization_endpoint?: string;
	provider_name_suggestion?: string;
}

export async function getOidcSettings(): Promise<OidcSettings> {
	const { data, response } = await api.GET('/api/admin/settings/oidc');
	return ensureData(data, response, '/api/admin/settings/oidc');
}

export async function testOidc(issuerUrl: string): Promise<OidcTestResult> {
	const { data, error } = await api.POST('/api/admin/settings/oidc/test', {
		body: { issuer_url: issuerUrl }
	});
	return data ?? asResult<OidcTestResult>(error) ?? { success: false, message: 'Request failed' };
}

export async function saveOidc(body: Record<string, unknown>): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/settings/oidc', { body });
	if (!response.ok) throwFailed('PUT /api/admin/settings/oidc', response, error);
}

// ── Storage settings + migration ───────────────────────────────────────────

export interface StorageSettings {
	backend: string;
	s3_endpoint_url?: string | null;
	s3_bucket?: string | null;
	s3_region?: string | null;
	s3_access_key_set?: boolean;
	s3_secret_key_set?: boolean;
	s3_force_path_style?: boolean;
	env_overrides?: string[];
	current_backend?: string;
	total_blobs?: number;
	total_bytes_stored?: number;
	dedup_ratio?: number;
}

export async function getStorageSettings(): Promise<StorageSettings> {
	const { data, response } = await api.GET('/api/admin/settings/storage');
	return ensureData(data, response, '/api/admin/settings/storage');
}

export async function saveStorage(body: Record<string, unknown>): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/settings/storage', { body });
	if (!response.ok) throwFailed('PUT /api/admin/settings/storage', response, error);
}

export async function testStorage(body: Record<string, unknown>): Promise<StorageTestResult> {
	const { data, error } = await api.POST('/api/admin/settings/storage/test', { body });
	return data ?? asResult<StorageTestResult>(error) ?? { connected: false };
}

export interface MigrationStatus {
	status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
	total_blobs: number;
	migrated_blobs: number;
	migrated_bytes: number;
	throughput_bytes_per_sec?: number;
	failed_blobs?: string[];
}

export async function getMigration(): Promise<MigrationStatus> {
	const { data, response } = await api.GET('/api/admin/storage/migration');
	return ensureData(data, response, '/api/admin/storage/migration');
}

export async function migrationAction(
	action: 'start' | 'pause' | 'resume' | 'complete'
): Promise<void> {
	const { error, response } = await api.POST('/api/admin/storage/migration/{action}', {
		params: { path: { action } },
		body: action === 'start' ? { concurrency: 4 } : {}
	});
	if (!response.ok) throwFailed(`POST /api/admin/storage/migration/${action}`, response, error);
}

/** Result of a `verify` integrity check (POST .../migration/verify). */
export interface MigrationVerifyResult {
	passed: boolean;
	sample_checked: number;
	pg_blob_count: number;
	missing_in_target: string[];
	size_mismatches: string[];
}

/**
 * Run an integrity verification pass over a sample of migrated blobs. Unlike
 * the other migration actions this returns a structured result that the caller
 * renders (passed / sample-checked / missing / size-mismatch counts).
 */
export async function verifyMigration(sampleSize = 100): Promise<MigrationVerifyResult> {
	const { data, error, response } = await api.POST('/api/admin/storage/migration/verify', {
		body: { sample_size: sampleSize }
	});
	if (!response.ok) throwFailed('verify', response, error);
	const r = data ?? {};
	return {
		passed: r.passed ?? false,
		sample_checked: r.sample_checked ?? 0,
		pg_blob_count: r.pg_blob_count ?? 0,
		missing_in_target: r.missing_in_target ?? [],
		size_mismatches: r.size_mismatches ?? []
	};
}

// ── Plugins ─────────────────────────────────────────────────────────────

export interface PluginInfo {
	id: string;
	name: string;
	version?: string;
	enabled: boolean;
	description?: string;
	abi?: string | number;
	subscriptions?: string[];
}

export interface PluginRetention {
	retention_days: number;
	max_bytes: number;
}

/**
 * Install a plugin from a .zip bundle. The browser sets the multipart
 * Content-Type (with boundary) — do not override it here. Kept on `apiFetch`
 * (not the typed client): FormData uploads stay off the JSON path.
 */
export async function installPlugin(bundle: File): Promise<PluginInfo> {
	const form = new FormData();
	form.append('bundle', bundle);
	const res = await apiFetch('/api/admin/plugins', {
		method: 'POST',
		credentials: 'same-origin',
		headers: { ...getCsrfHeaders() },
		body: form
	});
	if (!res.ok) {
		const e = (await res.json().catch(() => ({}))) as { message?: string };
		throw new Error(e.message || `install failed: ${res.status}`);
	}
	return (await res.json()) as PluginInfo;
}

export async function getPluginRetention(id: string): Promise<PluginRetention | null> {
	const { data, response } = await api.GET('/api/admin/plugins/{id}/retention', {
		params: { path: { id } }
	});
	if (!response.ok || data === undefined) return null;
	return data;
}

export async function savePluginRetention(id: string, r: PluginRetention): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/plugins/{id}/retention', {
		params: { path: { id } },
		body: r
	});
	if (!response.ok) throwFailed(`PUT /api/admin/plugins/${id}/retention`, response, error);
}

export async function clearPluginLogs(id: string): Promise<void> {
	const { error, response } = await api.DELETE('/api/admin/plugins/{id}/logs', {
		params: { path: { id } }
	});
	if (!response.ok) throwFailed(`DELETE /api/admin/plugins/${id}/logs`, response, error);
}

export interface PluginsResult {
	/** false when the plugin subsystem is disabled (server returns 503). */
	available: boolean;
	enabled?: boolean;
	plugins: PluginInfo[];
}

export async function listPlugins(): Promise<PluginsResult> {
	const { data, response } = await api.GET('/api/admin/plugins');
	if (response.status === 503) return { available: false, plugins: [] };
	if (!response.ok) throw new Error(`plugins failed: ${response.status}`);
	return { available: true, enabled: data?.enabled, plugins: data?.plugins ?? [] };
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
	const { error, response } = await api.PUT('/api/admin/plugins/{id}/enabled', {
		params: { path: { id } },
		body: { enabled }
	});
	if (!response.ok) throwFailed(`PUT /api/admin/plugins/${id}/enabled`, response, error);
}

export async function deletePlugin(id: string): Promise<void> {
	const { error, response } = await api.DELETE('/api/admin/plugins/{id}', {
		params: { path: { id } }
	});
	if (!response.ok) throwFailed(`DELETE /api/admin/plugins/${id}`, response, error);
}

export interface PluginLogEntry {
	timestamp?: string;
	ts?: string;
	level?: string;
	message?: string;
	/** Streamed-entry message field (SSE / persisted logs use `msg`). */
	msg?: string;
	/** "outcome" | "log" — outcome entries carry a `reason`. */
	kind?: string;
	reason?: string;
	invocation_id?: string;
	[k: string]: unknown;
}

export interface PluginLogPage {
	total: number;
	entries: PluginLogEntry[];
}

export async function getPluginLogs(
	id: string,
	opts: { limit?: number; offset?: number; level?: string; search?: string } = {}
): Promise<PluginLogPage> {
	const { data, response } = await api.GET('/api/admin/plugins/{id}/logs', {
		params: {
			path: { id },
			query: {
				limit: opts.limit ?? 50,
				offset: opts.offset ?? 0,
				...(opts.level ? { level: opts.level } : {}),
				...(opts.search ? { search: opts.search } : {})
			}
		}
	});
	return ensureData(data, response, `/api/admin/plugins/${id}/logs`);
}
