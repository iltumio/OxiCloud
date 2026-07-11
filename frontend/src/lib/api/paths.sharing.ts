/**
 * Hand-authored path typings — drives, ReBAC grants + groups, the recipient
 * directory feeds, the favorites/recent/trash cursor feeds and the public
 * share-token contents. Part of `ExtraPaths` (see `$lib/api/paths.ts`).
 */

import type {
	CreateDriveBody,
	Drive,
	DriveMember,
	DriveMemberSubject,
	DrivePolicies,
	DrivePoliciesPartial,
	DriveRole,
	TrashResourcesResponse
} from './types';
import type { FavoritesResourceItem } from './endpoints/favorites';
import type {
	CreateGrantResponse,
	Grant,
	GrantResourceType,
	GrantSubject,
	GrantSubjectInput,
	IncomingGrantItem,
	NotifyOutcomeSet,
	OutgoingGrantItem,
	ShareRole
} from './endpoints/grants';
import type { GroupMember, GroupItem } from './endpoints/groups';
import type { RecentResourceItem } from './endpoints/recent';
import type { ResourcePage } from './endpoints/resources';
import type { ShareListing } from './endpoints/share';
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

/** Query params shared by the favorites/recent/trash `/resources` feeds. */
export interface ResourceFeedQuery {
	order_by?: string;
	limit?: number;
	cursor?: string;
	reverse?: boolean;
	/** Comma-separated `file,folder` filter. */
	resource_types?: string;
}

/** Query params for the grants incoming/outgoing `/resources` feeds. */
export interface GrantsFeedQuery {
	sort_by?: string;
	limit?: number;
	cursor?: string;
	reverse?: boolean;
	/** Comma-separated `file,folder` filter. */
	resource_types?: string;
}

export interface SharingPaths {
	'/api/drives': PathEntry<{
		get: Op<{ 200: JsonResponse<Drive[]> }>;
		post: JsonOp<CreateDriveBody, { 200: JsonResponse<Drive>; 201: JsonResponse<Drive> }>;
	}>;
	'/api/drives/{id}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse; 405: EmptyResponse; 409: EmptyResponse },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/drives/{id}/members': PathEntry<{
		get: Op<{ 200: JsonResponse<DriveMember[]> }, PathParams<{ id: string }>>;
		post: JsonOp<
			{ subject: DriveMemberSubject; role: DriveRole; expires_at: string | null },
			{ 200: JsonResponse<DriveMember>; 201: JsonResponse<DriveMember> },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/drives/{id}/members/{kind}/{sid}': PathEntry<{
		patch: JsonOp<
			{ role: DriveRole; expires_at: string | null },
			{ 200: JsonResponse<DriveMember> },
			PathParams<{ id: string; kind: string; sid: string }>
		>;
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse },
			PathParams<{ id: string; kind: string; sid: string }>
		>;
	}>;
	'/api/drives/{id}/policies': PathEntry<{
		patch: JsonOp<
			DrivePoliciesPartial,
			{ 200: JsonResponse<DrivePolicies> },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/grants': PathEntry<{
		get: Op<
			{ 200: JsonResponse<Grant[]> },
			RequiredQueryParams<{ resource_type: GrantResourceType; resource_id: string }>
		>;
		post: JsonOp<
			{
				subject: GrantSubjectInput;
				resource: { type: GrantResourceType; id: string };
				role: ShareRole;
				expires_at: string | null;
			},
			{ 200: JsonResponse<CreateGrantResponse>; 201: JsonResponse<CreateGrantResponse> }
		>;
	}>;
	'/api/grants/role': PathEntry<{
		put: JsonOp<
			{
				subject: GrantSubject;
				resource: { type: GrantResourceType; id: string };
				role: ShareRole;
				expires_at: string | null;
			},
			{ 200: EmptyResponse }
		>;
	}>;
	'/api/grants/{id}': PathEntry<{
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/grants/{id}/notify': PathEntry<{
		post: Op<
			{
				200: JsonResponse<NotifyOutcomeSet>;
				204: EmptyResponse;
				429: EmptyResponse;
			},
			PathParams<{ id: string }>
		>;
	}>;
	'/api/grants/incoming/resources': PathEntry<{
		get: Op<{ 200: JsonResponse<ResourcePage<IncomingGrantItem>> }, QueryParams<GrantsFeedQuery>>;
	}>;
	'/api/grants/outgoing/resources': PathEntry<{
		get: Op<{ 200: JsonResponse<ResourcePage<OutgoingGrantItem>> }, QueryParams<GrantsFeedQuery>>;
	}>;
	'/api/groups': PathEntry<{
		get: Op<
			{
				200: JsonResponse<
					GroupItem[] | { groups?: GroupItem[]; items?: GroupItem[]; total?: number }
				>;
			},
			QueryParams<{ limit?: number; offset?: number; q?: string }>
		>;
		post: JsonOp<
			{ name: string; description: string | null },
			{ 200: EmptyResponse; 201: EmptyResponse }
		>;
	}>;
	'/api/groups/search': PathEntry<{
		get: Op<
			{ 200: JsonResponse<{ id: string; name: string }[]> },
			RequiredQueryParams<{ q: string; limit?: number }>
		>;
	}>;
	'/api/groups/{id}': PathEntry<{
		patch: JsonOp<{ name: string }, { 200: EmptyResponse }, PathParams<{ id: string }>>;
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ id: string }>>;
	}>;
	'/api/groups/{id}/members': PathEntry<{
		get: Op<{ 200: JsonResponse<GroupMember[]> }, PathParams<{ id: string }>>;
		post: JsonOp<
			{ user_id: string } | { group_id: string },
			{ 200: EmptyResponse; 201: EmptyResponse },
			PathParams<{ id: string }>
		>;
	}>;
	'/api/groups/{id}/members/user/{user_id}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse },
			PathParams<{ id: string; user_id: string }>
		>;
	}>;
	'/api/groups/{id}/members/group/{group_id}': PathEntry<{
		delete: Op<
			{ 200: EmptyResponse; 204: EmptyResponse },
			PathParams<{ id: string; group_id: string }>
		>;
	}>;
	'/api/favorites/resources': PathEntry<{
		get: Op<
			{ 200: JsonResponse<ResourcePage<FavoritesResourceItem>> },
			QueryParams<ResourceFeedQuery>
		>;
	}>;
	'/api/recent/resources': PathEntry<{
		get: Op<
			{ 200: JsonResponse<ResourcePage<RecentResourceItem>> },
			QueryParams<ResourceFeedQuery>
		>;
	}>;
	'/api/trash/resources': PathEntry<{
		get: Op<{ 200: JsonResponse<TrashResourcesResponse> }, QueryParams<ResourceFeedQuery>>;
	}>;
	'/api/trash/drive/{drive_id}': PathEntry<{
		delete: Op<{ 200: EmptyResponse; 204: EmptyResponse }, PathParams<{ drive_id: string }>>;
	}>;
	'/api/s/{token}/contents': PathEntry<{
		get: Op<
			{
				200: JsonResponse<ShareListing>;
				401: EmptyResponse;
				404: EmptyResponse;
				410: EmptyResponse;
			},
			PathParams<{ token: string }>
		>;
	}>;
	'/api/s/{token}/contents/{folder_id}': PathEntry<{
		get: Op<
			{
				200: JsonResponse<ShareListing>;
				401: EmptyResponse;
				404: EmptyResponse;
				410: EmptyResponse;
			},
			PathParams<{ token: string; folder_id: string }>
		>;
	}>;
}
