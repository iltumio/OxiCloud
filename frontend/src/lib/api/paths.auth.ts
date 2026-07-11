/**
 * Hand-authored path typings — auth primitives, first-run setup, OIDC, magic
 * links, device authorization, profile/account and per-user profile
 * resolution. Part of `ExtraPaths` (see `$lib/api/paths.ts`).
 */

import type { AuthResponse, User } from './types';
import type { AuthStatus, OidcProviders } from './endpoints/auth';
import type { DeviceInfo } from './endpoints/device';
import type { AppPassword, ProfilePatch } from './endpoints/profile';
import type { SystemContact } from './endpoints/recipients';
import type { UserProfileDto } from './endpoints/users';
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

export interface AuthPaths {
	'/api/auth/login': PathEntry<{
		post: JsonOp<
			{ username: string; password: string },
			{ 200: JsonResponse<AuthResponse>; 401: EmptyResponse }
		>;
	}>;
	'/api/auth/logout': PathEntry<{
		post: JsonOp<Record<string, never>, { 200: EmptyResponse; 204: EmptyResponse }>;
	}>;
	'/api/auth/refresh': PathEntry<{
		post: JsonOp<Record<string, never>, { 200: JsonResponse<AuthResponse>; 401: EmptyResponse }>;
	}>;
	'/api/auth/me': PathEntry<{
		get: Op<{ 200: JsonResponse<User>; 401: EmptyResponse }>;
	}>;
	'/api/auth/status': PathEntry<{
		get: Op<{ 200: JsonResponse<AuthStatus> }>;
	}>;
	'/api/setup': PathEntry<{
		post: JsonOp<
			{ username: string; email: string; password: string },
			{ 200: EmptyResponse; 201: EmptyResponse }
		>;
	}>;
	'/api/auth/register': PathEntry<{
		post: JsonOp<
			{ username: string; email: string; password: string; role: string },
			{ 200: EmptyResponse; 201: EmptyResponse }
		>;
	}>;
	'/api/auth/oidc/providers': PathEntry<{
		get: Op<{ 200: JsonResponse<OidcProviders> }>;
	}>;
	'/api/auth/oidc/exchange': PathEntry<{
		post: JsonOp<{ code: string }, { 200: JsonResponse<{ user?: User }>; 401: EmptyResponse }>;
	}>;
	'/api/auth/magic-link/send': PathEntry<{
		post: JsonOp<{ email: string }, { 200: EmptyResponse; 503: EmptyResponse }>;
	}>;
	'/api/auth/device/verify': PathEntry<{
		get: Op<
			{ 200: JsonResponse<DeviceInfo & { valid?: boolean }>; 401: EmptyResponse },
			RequiredQueryParams<{ code: string }>
		>;
		post: JsonOp<{ user_code: string; action: 'approve' | 'deny' }, { 200: EmptyResponse }>;
	}>;
	'/api/auth/change-password': PathEntry<{
		put: JsonOp<{ current_password: string; new_password: string }, { 200: EmptyResponse }>;
	}>;
	'/api/auth/me/profile': PathEntry<{
		patch: JsonOp<
			ProfilePatch,
			{ 200: JsonResponse<User>; 403: EmptyResponse; 409: EmptyResponse }
		>;
	}>;
	'/api/auth/me/image': PathEntry<{
		put: JsonOp<{ image: string | null }, { 200: EmptyResponse }>;
	}>;
	'/api/auth/app-passwords': PathEntry<{
		get: Op<{ 200: JsonResponse<AppPassword[] | { app_passwords?: AppPassword[] }> }>;
		post: JsonOp<
			{ label: string },
			{ 200: JsonResponse<{ password: string }>; 201: JsonResponse<{ password: string }> }
		>;
	}>;
	'/api/auth/app-passwords/{id}': PathEntry<{
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/users/{id}': PathEntry<{
		get: Op<{ 200: JsonResponse<UserProfileDto>; 404: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/address-books/system/contacts': PathEntry<{
		get: Op<{ 200: JsonResponse<SystemContact[]> }, QueryParams<{ include_self?: boolean }>>;
	}>;
}
