<script lang="ts">
	import { createInfiniteQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import { apiMutationOptions, apiQueryKey } from '$lib/api/query';
	import { errorToast } from '$lib/utils/errors';
	import { expiryChip, fetchTrashPage, remainingDaysBucket } from '$lib/api/endpoints/trash';
	import type { ResourcePage } from '$lib/api/endpoints/resources';
	import { dateBucket, sizeBucket, typeLabel } from '$lib/api/endpoints/favorites';
	import type { Drive, FileItem, TrashResourceItem } from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import ResourceList, {
		type GroupByDef,
		type ResourceEntry
	} from '$lib/components/ResourceList.svelte';
	import { confirmDialog } from '$lib/stores/dialogs.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { drives as drivesStore } from '$lib/stores/drives.svelte';
	import { ui } from '$lib/stores/ui.svelte';

	// Default: items expiring soonest first, grouped by remaining days.
	let groupBy = $state('remainingDays');
	let reversed = $state(false);

	function orderByForGroup(): string {
		return groupBys.find((g) => g.key === groupBy)?.orderBy ?? 'deletion_date';
	}

	// ── Server state via svelte-query ─────────────────────────────────────────
	// Cursor pagination maps onto an infinite query keyed by (orderBy, reversed):
	// changing the group-by or sort direction re-keys the query and refetches
	// from page 1 automatically (replacing the old imperative `load(true, …)`).
	const queryClient = useQueryClient();
	const TRASH_KEY = apiQueryKey('get', '/api/trash/resources');

	const trashQuery = createInfiniteQuery(() => ({
		queryKey: [...TRASH_KEY, { orderBy: orderByForGroup(), reversed }] as const,
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			fetchTrashPage({
				cursor: pageParam,
				orderBy: orderByForGroup(),
				reverse: reversed,
				resourceTypes: ['file', 'folder']
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last: ResourcePage<TrashResourceItem>) => last.next_cursor ?? undefined
	}));

	const raw = $derived<TrashResourceItem[]>(trashQuery.data?.pages.flatMap((p) => p.items) ?? []);
	const loading = $derived(trashQuery.isPending || trashQuery.isFetchingNextPage);
	const error = $derived(
		trashQuery.isError ? t('errors_loadFailed', 'Failed to load items') : null
	);

	/** Re-fetch from the top so pagination + grouping stay correct after a mutation. */
	function invalidateTrash(): Promise<void> {
		return queryClient.invalidateQueries({ queryKey: TRASH_KEY });
	}

	const restoreMutation = createMutation(() =>
		apiMutationOptions('post', '/api/trash/{id}/restore')
	);
	const deleteMutation = createMutation(() => apiMutationOptions('delete', '/api/trash/{id}'));
	const emptyMutation = createMutation(() => apiMutationOptions('delete', '/api/trash/empty'));
	const emptyDriveMutation = createMutation(() =>
		apiMutationOptions('delete', '/api/trash/drive/{drive_id}')
	);

	const entries = $derived(
		raw.map((it): ResourceEntry => {
			const isFile = it.resource_type === 'file';
			return {
				id: it.resource.id,
				name: it.resource.name,
				kind: it.resource_type,
				iconClass: it.resource.icon_class,
				path: it.resource.path,
				size: isFile ? (it.resource as FileItem).size : null,
				// `date` carries the deletion date — rendered as an expiry chip.
				date: it.deletion_date,
				category: isFile ? it.resource.category : 'Folder',
				modifiedAt: it.trashed_at,
				// D2b: surface drive_id so the Drive group-by can bucket by it.
				// Reuses the existing `ownerId` slot on ResourceEntry — both
				// represent a UUID the listing pivots on; no new field needed.
				ownerId: it.drive_id
			};
		})
	);

	// "Drive" group rank: default-personal first, then secondary personal, then
	// shared — matches `DrivePicker.svelte::sortedDrives` so the sidebar and
	// trash sections agree on ordering. Used as the bucket sort key.
	function driveRank(d: Drive | null): number {
		if (!d) return 99;
		if (d.default_for_user) return 0;
		return d.kind === 'personal' ? 1 : 2;
	}
	function driveLabel(driveId: string): string {
		const d = drivesStore.findById(driveId);
		return d?.name ?? driveId;
	}
	function driveBucketKey(driveId: string): string {
		// Bucket key has to be a string but we want ordering; prefix with
		// rank so the natural lexical sort puts buckets in the picker's order.
		const d = drivesStore.findById(driveId);
		const rank = driveRank(d).toString().padStart(2, '0');
		return `${rank}:${driveId}`;
	}
	function driveBucketLabel(key: string): string {
		const driveId = key.split(':')[1] ?? key;
		return driveLabel(driveId);
	}

	const groupBys: GroupByDef[] = [
		{ key: '', label: t('files.name', 'Name'), orderBy: 'name', icon: 'arrow-up-a-z' },
		{
			key: 'drive',
			label: t('trash.groupby.drive', 'Drive'),
			orderBy: 'name',
			bucketOf: (e) => (e.ownerId ? driveBucketKey(e.ownerId) : null),
			labelOf: driveBucketLabel
		},
		{
			key: 'remainingDays',
			label: t('trash.groupby.remaining_days', 'Remaining days'),
			orderBy: 'deletion_date',
			bucketOf: (e) => remainingDaysBucket(e.date)
		},
		{
			key: 'type',
			label: t('groupby.type', 'Type'),
			orderBy: 'type',
			bucketOf: (e) => e.category ?? 'other',
			labelOf: (k) => typeLabel(k)
		},
		{
			key: 'size',
			label: t('groupby.size', 'Size'),
			orderBy: 'size',
			bucketOf: (e) => sizeBucket(e.kind === 'folder' ? null : e.size)
		},
		{
			key: 'trashedTime',
			label: t('trash.groupby.trashed_time', 'Trashed time'),
			orderBy: 'trashed_at',
			bucketOf: (e) => dateBucket(e.modifiedAt)
		}
	];

	async function restore(entry: ResourceEntry) {
		try {
			await restoreMutation.mutateAsync({ params: { path: { id: entry.id } } });
			ui.notify(t('trash.restored', 'Restored'), 'success');
			await invalidateTrash();
		} catch (e) {
			errorToast(e);
		}
	}

	async function purge(entry: ResourceEntry) {
		const ok = await confirmDialog({
			title: t('trash.delete', 'Delete permanently'),
			message: t('trash.confirm_delete', 'Permanently delete this item? This cannot be undone.'),
			confirmText: t('trash.delete', 'Delete'),
			danger: true
		});
		if (!ok) return;
		try {
			await deleteMutation.mutateAsync({ params: { path: { id: entry.id } } });
			await invalidateTrash();
		} catch (e) {
			errorToast(e);
		}
	}

	async function purgeAll() {
		const ok = await confirmDialog({
			title: t('trash.empty_action', 'Empty trash'),
			message: t('trash.confirm_empty', 'Empty the trash? This cannot be undone.'),
			confirmText: t('trash.empty_action', 'Empty trash'),
			danger: true
		});
		if (!ok) return;
		try {
			await emptyMutation.mutateAsync({});
			await invalidateTrash();
		} catch (e) {
			errorToast(e);
		}
	}

	// Per-drive empty (D2b stage 4 follow-up). The bucket key on the
	// Drive group-by encodes "{rank}:{driveId}" so the natural lexical
	// sort puts default-personal first; we strip the rank prefix here
	// to recover the raw drive UUID. Only an Owner of the drive
	// (Delete-bearing role) reaches the per-drive Empty button because
	// the backend resolves a Delete-set first and refuses (404) any
	// other drive.
	function driveIdFromBucketKey(key: string): string {
		return key.includes(':') ? (key.split(':')[1] ?? key) : key;
	}

	async function purgeDrive(bucketKey: string) {
		const driveId = driveIdFromBucketKey(bucketKey);
		const drive = drivesStore.findById(driveId);
		// Owner-only check mirrors the backend gate so the UI doesn't
		// surface the action for non-Owners — keeps the affordance
		// honest. The bucket only appears on the page if the trash list
		// already contained items the caller could see, but caller_role
		// distinguishes Owner from Viewer/Editor on shared drives.
		const ok = await confirmDialog({
			title: t('trash.empty_drive_title', 'Empty drive trash'),
			message: t(
				'trash.confirm_empty_drive',
				{ name: drive?.name ?? driveId },
				'Empty the trash on drive "{{name}}"? This cannot be undone.'
			),
			confirmText: t('trash.empty_action', 'Empty trash'),
			danger: true
		});
		if (!ok) return;
		try {
			await emptyDriveMutation.mutateAsync({ params: { path: { drive_id: driveId } } });
			// Refetch drops every entry that belonged to this drive.
			await invalidateTrash();
		} catch (e) {
			errorToast(e);
		}
	}

	// The Drive group-by is the only one where a per-bucket empty
	// affordance is meaningful — every other bucket key (remaining
	// days, type, size, trashed time) isn't a permission scope. Hide
	// the button on those group-bys.
	const showPerDriveEmpty = $derived(groupBy === 'drive');

	function driveCanPurge(driveId: string): boolean {
		const d = drivesStore.findById(driveId);
		// `caller_role === 'owner'` is the same gate the backend
		// applies via Permission::Delete in the role bundle. Hide the
		// button on Viewer/Editor drives so a click can't 404.
		return d?.caller_role === 'owner';
	}

	/** Tiered expiry chip → daisyUI badge classes (was `.expiry-chip--*`). */
	const CHIP_CLASS: Record<string, string> = {
		never: 'badge-ghost text-base-content/50',
		normal: 'badge-ghost',
		caution: 'badge-soft badge-warning',
		soon: 'badge-warning',
		urgent: 'badge-soft badge-error',
		expired: 'badge-soft badge-error font-semibold'
	};

	onMount(() => {
		// Drive names for the "Drive" group-by labels — `drivesStore.load()` is
		// idempotent (cached on the singleton) so this is essentially free.
		void drivesStore.load();
	});
</script>

<svelte:head><title>{t('nav.trash', 'Trash')} · OxiCloud</title></svelte:head>

<ResourceList
	title={t('nav.trash', 'Trash')}
	items={entries}
	{loading}
	{error}
	emptyIcon="trash"
	emptyText={t('trash.empty_state', 'Trash is empty')}
	hasMore={trashQuery.hasNextPage}
	onloadmore={() => void trashQuery.fetchNextPage()}
	pathLabel={t('trash.original_location', 'Original location')}
	dateLabel={t('trash.remaining', 'Remaining')}
	{groupBys}
	bind:groupBy
	bind:reversed
>
	{#snippet toolbar()}
		{#if entries.length > 0}
			<button class="btn btn-error" data-testid="trash-empty-btn" onclick={purgeAll}>
				<Icon name="trash" />
				{t('trash.empty_action', 'Empty trash')}
			</button>
		{/if}
	{/snippet}
	{#snippet dateCell(entry)}
		{@const chip = expiryChip(entry.date)}
		<span
			class="badge badge-sm gap-1 whitespace-nowrap font-medium {CHIP_CLASS[chip.tier] ??
				CHIP_CLASS.normal}"
		>
			<Icon name={chip.icon} class="text-[0.85em]" />
			{chip.label}
		</span>
	{/snippet}
	{#snippet bucketAction(bucketKey: string)}
		{#if showPerDriveEmpty}
			{@const driveId = driveIdFromBucketKey(bucketKey)}
			{#if driveCanPurge(driveId)}
				<button
					type="button"
					class="btn btn-ghost btn-xs btn-square text-error"
					data-testid={`trash-empty-drive-btn-${driveId}`}
					title={t('trash.empty_drive_title', 'Empty drive trash')}
					aria-label={t('trash.empty_drive_title', 'Empty drive trash')}
					onclick={() => purgeDrive(bucketKey)}
				>
					<Icon name="trash" />
				</button>
			{/if}
		{/if}
	{/snippet}
	{#snippet actions(entry)}
		<button
			class="btn btn-ghost btn-xs btn-square text-base-content/70"
			data-testid={`trash-restore-btn-${entry.id}`}
			title={t('trash.restore', 'Restore')}
			onclick={() => restore(entry)}
		>
			<Icon name="undo" />
		</button>
		<button
			class="btn btn-ghost btn-xs btn-square text-error"
			data-testid={`trash-delete-btn-${entry.id}`}
			title={t('trash.delete', 'Delete permanently')}
			onclick={() => purge(entry)}
		>
			<Icon name="trash" />
		</button>
	{/snippet}
</ResourceList>
