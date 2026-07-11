/**
 * Hand-authored path typings — the `/api/admin/*` surface (users, dashboard,
 * SMTP, OIDC/storage settings, storage migration, plugins, drives,
 * maintenance). Part of `ExtraPaths` (see `$lib/api/paths.ts`).
 */

import type { Drive, DriveMember, DriveMemberSubject, DriveRole } from './types';
import type {
	AdminDashboard,
	AdminUsersPage,
	CreateUserInput,
	GeneratedKey,
	MigrationStatus,
	MigrationVerifyResult,
	OidcSettings,
	OidcTestResult,
	PluginInfo,
	PluginLogPage,
	PluginRetention,
	ReextractResult,
	SmtpInfo,
	SmtpTestResult,
	StorageSettings,
	StorageTestResult
} from './endpoints/admin';
import type {
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

export interface AdminPaths {
	'/api/admin/users': PathEntry<{
		get: Op<
			{ 200: JsonResponse<AdminUsersPage> },
			RequiredQueryParams<{ limit: number; offset: number }>
		>;
		post: JsonOp<CreateUserInput, { 200: EmptyResponse; 201: EmptyResponse }>;
	}>;
	'/api/admin/users/{id}': PathEntry<{
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/users/{id}/role': PathEntry<{
		put: JsonOp<{ role: string }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/users/{id}/active': PathEntry<{
		put: JsonOp<{ active: boolean }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/users/{id}/quota': PathEntry<{
		put: JsonOp<{ quota_bytes: number }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/users/{id}/password': PathEntry<{
		put: JsonOp<{ new_password: string }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/dashboard': PathEntry<{
		get: Op<{ 200: JsonResponse<AdminDashboard> }>;
	}>;
	'/api/admin/settings/registration': PathEntry<{
		put: JsonOp<{ registration_enabled: boolean }, { 200: EmptyResponse }>;
	}>;
	'/api/admin/smtp/info': PathEntry<{
		get: Op<{ 200: JsonResponse<SmtpInfo> }>;
	}>;
	'/api/admin/smtp/test': PathEntry<{
		post: JsonOp<{ to: string }, { 200: JsonResponse<SmtpTestResult>; 503: EmptyResponse }>;
	}>;
	'/api/admin/settings/oidc': PathEntry<{
		get: Op<{ 200: JsonResponse<OidcSettings> }>;
		put: JsonOp<Record<string, unknown>, { 200: EmptyResponse }>;
	}>;
	'/api/admin/settings/oidc/test': PathEntry<{
		post: JsonOp<{ issuer_url: string }, { 200: JsonResponse<OidcTestResult> }>;
	}>;
	'/api/admin/settings/storage': PathEntry<{
		get: Op<{ 200: JsonResponse<StorageSettings> }>;
		put: JsonOp<Record<string, unknown>, { 200: EmptyResponse }>;
	}>;
	'/api/admin/settings/storage/test': PathEntry<{
		post: JsonOp<Record<string, unknown>, { 200: JsonResponse<StorageTestResult> }>;
	}>;
	'/api/admin/settings/storage/generate-key': PathEntry<{
		post: Op<{ 200: JsonResponse<GeneratedKey> }>;
	}>;
	'/api/admin/storage/migration': PathEntry<{
		get: Op<{ 200: JsonResponse<MigrationStatus> }>;
	}>;
	'/api/admin/storage/migration/{action}': PathEntry<{
		post: JsonOp<
			{ concurrency?: number },
			{ 200: EmptyResponse },
			PathParams<{ action: 'start' | 'pause' | 'resume' | 'complete' }>
		>;
	}>;
	'/api/admin/storage/migration/verify': PathEntry<{
		post: JsonOp<{ sample_size: number }, { 200: JsonResponse<Partial<MigrationVerifyResult>> }>;
	}>;
	'/api/admin/audio/metadata/reextract': PathEntry<{
		post: Op<{ 200: JsonResponse<ReextractResult> }>;
	}>;
	'/api/admin/photos/metadata/reextract': PathEntry<{
		post: Op<{ 200: JsonResponse<ReextractResult> }>;
	}>;
	'/api/admin/plugins': PathEntry<{
		get: Op<{
			200: JsonResponse<{ enabled?: boolean; plugins?: PluginInfo[] }>;
			503: EmptyResponse;
		}>;
		post: MultipartOp<
			{ bundle: string },
			{ 200: JsonResponse<PluginInfo>; 201: JsonResponse<PluginInfo> }
		>;
	}>;
	'/api/admin/plugins/{id}': PathEntry<{
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/plugins/{id}/enabled': PathEntry<{
		put: JsonOp<{ enabled: boolean }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/plugins/{id}/retention': PathEntry<{
		get: Op<{ 200: JsonResponse<PluginRetention>; 404: EmptyResponse }, PathParams<{ id: string }>>;
		put: JsonOp<PluginRetention, { 200: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/plugins/{id}/logs': PathEntry<{
		get: Op<
			{ 200: JsonResponse<PluginLogPage> },
			PathAndQueryParams<
				{ id: string },
				{ limit?: number; offset?: number; level?: string; search?: string }
			>
		>;
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/admin/drives': PathEntry<{
		get: Op<{ 200: JsonResponse<Drive[]> }>;
	}>;
	'/api/admin/drives/{id}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse; 405: EmptyResponse; 409: EmptyResponse },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/admin/drives/{id}/members': PathEntry<{
		get: Op<{ 200: JsonResponse<DriveMember[]> }, PathParams<{ id: string }>>;
		post: JsonOp<
			{ subject: DriveMemberSubject; role: DriveRole; expires_at: string | null },
			{ 200: JsonResponse<DriveMember>; 201: JsonResponse<DriveMember> },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/admin/drives/{id}/members/{kind}/{sid}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse },
			PathParams<{ id: string; kind: string; sid: string }>
		>;
	}>;
}
