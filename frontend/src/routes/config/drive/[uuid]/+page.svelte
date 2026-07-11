<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';

	import { deleteDrive, listDriveMembers } from '$lib/api/endpoints/drives';
	import { renameFolder } from '$lib/api/endpoints/folders';
	import { errorToast } from '$lib/utils/errors';
	import { ui } from '$lib/stores/ui.svelte';
	import type { Drive, DriveRole, DrivePoliciesPartial } from '$lib/api/types';
	import PolicyList from '$lib/components/PolicyList.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import UserVignette from '$lib/components/UserVignette.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { drives as drivesStore, driveIcon } from '$lib/stores/drives.svelte';
	import { formatDate } from '$lib/utils/display';
	import { formatBytes } from '$lib/utils/format';
	import { readAllPolicies } from '$lib/utils/drivePolicies';

	const uuid = $derived(page.params.uuid ?? '');
	const drive = $derived<Drive | null>(drivesStore.findById(uuid));

	const queryClient = useQueryClient();

	// Member list is server state → svelte-query. The key carries the uuid, so
	// navigating between `/config/drive/<A>` and `/config/drive/<B>` (same route
	// component, different param) swaps to a fresh fetch with no stale flash —
	// this replaces the manual reset-and-refetch $effect of the legacy page.
	// A 404 here means the caller lacks Read on the drive — which is also what
	// the "Drive not found" card conveys; the error renders in the (empty)
	// listing area rather than as a noisy toast.
	const membersQuery = createQuery(() => ({
		queryKey: ['drive-members', uuid] as const,
		queryFn: () => listDriveMembers(uuid),
		enabled: uuid.length > 0
	}));
	const members = $derived(membersQuery.data ?? []);
	const membersLoaded = $derived(!membersQuery.isPending);
	const membersError = $derived(membersQuery.error ? (membersQuery.error as Error).message : null);

	// Mutation controls are gated by *both* caller_role AND drive kind:
	// even an Owner of a personal drive can't change membership (the
	// backend guard refuses), so the UI hides the controls upfront for
	// honest UX. Shared drives + Owner role → full controls.
	const canManageMembers = $derived(drive?.kind === 'shared' && drive?.caller_role === 'owner');

	// Rename is allowed for any Owner (both shared and personal), since
	// the backend requires `Permission::Manage` on the drive's root
	// folder which only the Owner bundle carries. Personal-drive Owners
	// are the user themselves (seeded by the lifecycle hook).
	const canRename = $derived(drive?.caller_role === 'owner');

	// Delete is allowed for Owners — backend additionally refuses the
	// default Personal drive (405) and non-empty drives (409). We hide
	// the button on the default-personal drive so the affordance only
	// appears when it can actually succeed.
	const canDelete = $derived(drive?.caller_role === 'owner' && !drive?.default_for_user);

	let deleting = $state(false);

	async function confirmAndDelete() {
		if (!drive) return;
		const confirmText = t(
			'drive.delete_confirm',
			{ name: drive.name },
			'Delete drive "{{name}}"? This cannot be undone — the drive ' +
				'must be empty first or the server will refuse.'
		);
		if (typeof window === 'undefined' || !window.confirm(confirmText)) return;
		deleting = true;
		try {
			await deleteDrive(drive.id);
			drivesStore.invalidate();
			await drivesStore.load();
			ui.notify(t('drive.deleted', 'Drive deleted.'), 'success');
			// Send the user back to /files. The picker's reload above
			// already removed the now-deleted drive from the sidebar.
			await goto(resolve('/files'));
		} catch (e) {
			// 409 (non-empty) and 405 (default personal) come back as
			// thrown errors with the server's detail in the message —
			// surface as a toast rather than a silent failure.
			errorToast(e);
		} finally {
			deleting = false;
		}
	}

	// Inline rename state. `renameDraft` shadows `drive.name` while the
	// input is open; we don't write back to the store until the server
	// accepts the change. `renameBusy` disables the save/cancel buttons
	// during the round-trip.
	let renaming = $state(false);
	let renameDraft = $state('');
	let renameBusy = $state(false);

	function startRename() {
		if (!drive) return;
		renameDraft = drive.name;
		renaming = true;
	}

	function cancelRename() {
		renaming = false;
		renameDraft = '';
	}

	async function saveRename() {
		if (!drive) return;
		const next = renameDraft.trim();
		if (next.length === 0 || next === drive.name) {
			cancelRename();
			return;
		}
		renameBusy = true;
		try {
			// Drive name = root folder name (drive.md §3); rename via the
			// folder endpoint. Backend promotes the perm to Manage for
			// parent_id IS NULL, so a non-Owner caller would 404 here
			// (but the UI also hid this button for non-Owners).
			await renameFolder(drive.root_folder_id, next);
			drivesStore.invalidate();
			await drivesStore.load();
			renaming = false;
		} catch (e) {
			errorToast(e);
		} finally {
			renameBusy = false;
		}
	}

	function roleLabel(role: DriveRole): string {
		switch (role) {
			case 'owner':
				return t('drive.role.owner', 'Owner');
			case 'editor':
				return t('drive.role.editor', 'Editor');
			case 'contributor':
				return t('drive.role.contributor', 'Contributor');
			case 'commenter':
				return t('drive.role.commenter', 'Commenter');
			case 'viewer':
				return t('drive.role.viewer', 'Viewer');
		}
	}

	/** daisyUI badge flavour per role — owner stands out, write roles outlined. */
	function roleBadgeClass(role: DriveRole): string {
		if (role === 'owner') return 'badge-primary badge-outline font-semibold';
		if (role === 'editor' || role === 'contributor') return 'badge-outline';
		return 'badge-ghost';
	}

	// `shareDialogOpen` drives the ShareDialog modal — the same dialog
	// used for file/folder sharing, parameterised with `kind: 'drive'`
	// + `allowLinks: false`. Add/change-role/remove flow through the
	// dialog's existing grants plumbing (server-side those routes
	// dispatch to `DriveManagementService`).
	let shareDialogOpen = $state(false);

	// `dialogItem` is recomputed from the drive so the dialog title
	// reflects renames.
	const dialogItem = $derived(
		drive ? { id: drive.id, name: drive.name, kind: 'drive' as const } : null
	);

	// Refresh the on-page member list on every dialog mutation (add,
	// role change, remove). ShareDialog fires `onchange` for the full
	// set of grant mutations — `onshared` only covers creation, which
	// would leave role-change and removal stale here.
	function onShareDialogChange() {
		void queryClient.invalidateQueries({ queryKey: ['drive-members', uuid] });
	}

	const kindLabel = $derived.by(() => {
		if (!drive) return '';
		return drive.kind === 'shared'
			? t('drive.kind_shared', 'Shared drive')
			: t('drive.kind_personal', 'Personal drive');
	});

	const storagePct = $derived.by(() => {
		if (!drive || !drive.quota_bytes || drive.quota_bytes <= 0) return 0;
		return Math.min(100, (drive.used_bytes / drive.quota_bytes) * 100);
	});

	// Drive policies are OxiCloud-admin-only for mutation (§8), but
	// visible read-only here so members understand what rules apply to
	// the drive they're on. The admin's "Manage policies" modal on
	// `/admin` is the only editor. `readAllPolicies` normalises the raw
	// JSONB bag into a `Required<DrivePoliciesPartial>` — unknown keys
	// (or missing ones) resolve to `false`.
	const drivePoliciesView = $derived<Required<DrivePoliciesPartial>>(
		readAllPolicies((drive?.policies ?? {}) as Record<string, unknown>)
	);

	onMount(() => {
		void drivesStore.load();
	});

	const cardClass = 'rounded-box border border-base-300 bg-base-100 p-5';
	const cardTitleClass = 'mb-4 flex items-center gap-2 text-base font-semibold text-base-content';
	const iconBtnClass = 'btn btn-square btn-sm btn-ghost border border-base-300';
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
	{#if !drivesStore.loaded}
		<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
	{:else if !drive}
		<div class={cardClass}>
			<h2 class={cardTitleClass}>{t('drive.not_found_title', 'Drive not found')}</h2>
			<p class="text-base-content/60">
				{t('drive.not_found_body', "This drive doesn't exist or you don't have access to it.")}
			</p>
			<a class="link link-primary" href={resolve('/files')}
				>{t('drive.back_to_files', 'Back to Files')}</a
			>
		</div>
	{:else}
		<!-- Drive title row: icon + name (or inline rename input) + edit/save
		     affordances. Mirrors the visual weight of a static <h1> so the page
		     layout doesn't shift when entering rename mode. -->
		<div class="flex items-center gap-2">
			<Icon name={driveIcon(drive)} class="text-base-content/70 text-xl" />
			{#if renaming}
				<input
					class="input min-w-0 max-w-md flex-1 text-2xl font-semibold"
					type="text"
					data-testid="drive-rename-input"
					bind:value={renameDraft}
					maxlength="200"
					disabled={renameBusy}
					onkeydown={(e) => {
						if (e.key === 'Enter') void saveRename();
						else if (e.key === 'Escape') cancelRename();
					}}
				/>
				<button
					type="button"
					class={iconBtnClass}
					data-testid="drive-rename-save-btn"
					title={t('common.save', 'Save')}
					aria-label={t('common.save', 'Save')}
					onclick={() => void saveRename()}
					disabled={renameBusy}
				>
					<Icon name="check" />
				</button>
				<button
					type="button"
					class={iconBtnClass}
					data-testid="drive-rename-cancel-btn"
					title={t('common.cancel', 'Cancel')}
					aria-label={t('common.cancel', 'Cancel')}
					onclick={cancelRename}
					disabled={renameBusy}
				>
					<Icon name="times" />
				</button>
			{:else}
				<h1 class="text-base-content m-0 text-2xl font-bold">{drive.name}</h1>
				{#if canRename}
					<button
						type="button"
						class={iconBtnClass}
						data-testid="drive-rename-edit-btn"
						title={t('drive.rename', 'Rename drive')}
						aria-label={t('drive.rename', 'Rename drive')}
						onclick={startRename}
					>
						<Icon name="pencil-alt" />
					</button>
				{/if}
			{/if}
		</div>

		<div class={cardClass}>
			<h2 class={cardTitleClass}>
				<Icon name="info-circle" />
				{t('drive.info', 'Drive info')}
			</h2>
			<dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
				<dt class="text-base-content/60 text-sm">{t('drive.field.kind', 'Kind')}</dt>
				<dd class="text-base-content m-0">{kindLabel}</dd>

				{#if drive.default_for_user}
					<dt class="text-base-content/60 text-sm">{t('drive.field.default', 'Default')}</dt>
					<dd class="text-base-content m-0">
						{t('drive.field.default_yes', 'This is your home drive')}
					</dd>
				{/if}

				<dt class="text-base-content/60 text-sm">{t('drive.field.created', 'Created')}</dt>
				<dd class="text-base-content m-0">{formatDate(drive.created_at)}</dd>

				<dt class="text-base-content/60 text-sm">{t('drive.field.updated', 'Last updated')}</dt>
				<dd class="text-base-content m-0">{formatDate(drive.updated_at)}</dd>

				<dt class="text-base-content/60 text-sm">{t('drive.field.id', 'Identifier')}</dt>
				<dd class="text-base-content m-0 font-mono text-sm">{drive.id}</dd>
			</dl>
		</div>

		<div class={cardClass}>
			<h2 class={cardTitleClass}>
				<Icon name="hdd" />
				{t('drive.storage', 'Storage')}
			</h2>
			<div class="mb-4 grid grid-cols-3 gap-4">
				<div>
					<div class="text-base-content text-lg font-semibold">
						{formatBytes(drive.used_bytes)}
					</div>
					<div class="text-base-content/60 text-xs">{t('drive.used', 'Used')}</div>
				</div>
				<div>
					<div class="text-base-content text-lg font-semibold">
						{drive.quota_bytes && drive.quota_bytes > 0 ? formatBytes(drive.quota_bytes) : '∞'}
					</div>
					<div class="text-base-content/60 text-xs">{t('drive.quota', 'Quota')}</div>
				</div>
				<div>
					<div class="text-base-content text-lg font-semibold">
						{drive.quota_bytes && drive.quota_bytes > 0 ? `${Math.round(storagePct)}%` : '—'}
					</div>
					<div class="text-base-content/60 text-xs">{t('drive.usage', 'Usage')}</div>
				</div>
			</div>
			{#if drive.quota_bytes && drive.quota_bytes > 0}
				<progress
					class="progress progress-primary h-1.5 w-full"
					value={Math.round(storagePct)}
					max="100"
					aria-label={t('drive.usage', 'Usage')}
				></progress>
			{/if}
		</div>

		<div class={cardClass}>
			<div class="mb-3 flex items-center justify-between gap-3">
				<h2 class="{cardTitleClass} mb-0">
					<Icon name="users" />
					{t('drive.members', 'Members')}
				</h2>
				{#if canManageMembers}
					<button
						type="button"
						class="btn btn-primary btn-sm"
						data-testid="drive-manage-members-btn"
						onclick={() => (shareDialogOpen = true)}
					>
						<Icon name="user-plus" />
						{t('drive.manage_members', 'Manage members')}
					</button>
				{/if}
			</div>

			{#if !membersLoaded}
				<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else if members.length === 0}
				<p class="text-base-content/60">
					{membersError ?? t('drive.members_empty', 'No members.')}
				</p>
			{:else}
				<!-- Read-only summary. Add/change/remove happens inside the
				     ShareDialog modal opened by the button above; the inline
				     row controls used to live here have moved into the dialog
				     so the same flow handles file/folder + drive grants. -->
				<ul class="m-0 flex list-none flex-col gap-2 p-0">
					{#each members as m (m.id)}
						<li
							class="border-base-300/60 bg-base-200/40 flex items-center gap-3 rounded-lg border px-3 py-2"
						>
							{#if m.subject.type === 'user'}
								<UserVignette userId={m.subject.id} />
							{:else if m.subject.type === 'group'}
								<span class="text-base-content/70 inline-flex min-w-0 flex-1 items-center gap-2">
									<Icon name="users" />
									<span class="truncate font-mono text-sm">{m.subject.id}</span>
								</span>
							{:else}
								<span class="text-base-content/70 inline-flex min-w-0 flex-1 items-center gap-2">
									<Icon name="link" />
									<span class="truncate font-mono text-sm">{m.subject.id}</span>
								</span>
							{/if}
							<span class="badge ml-auto shrink-0 {roleBadgeClass(m.role)}">
								{roleLabel(m.role)}
							</span>
						</li>
					{/each}
				</ul>

				{#if !canManageMembers && drive.kind === 'personal'}
					<p class="text-base-content/60 mt-3 text-sm">
						{t(
							'drive.members.personal_immutable',
							'Personal drives have a fixed single-owner membership.'
						)}
					</p>
				{/if}
			{/if}
		</div>

		<!-- Policies card — read-only summary of the current drive rules.
		     Content is dense (seven toggle rows), so the whole card folds
		     into a native `<details>` disclosure (daisyUI collapse). Closed
		     by default; the admin-only mutation surface still lives on `/admin`. -->
		<details class="collapse-arrow border-base-300 bg-base-100 rounded-box collapse border">
			<summary class="collapse-title min-h-0 px-5 py-5">
				<h2 class="{cardTitleClass} mb-0">
					<Icon name="shield-alt" />
					{t('drive.policies', 'Policies')}
				</h2>
			</summary>
			<div class="collapse-content px-5">
				<p class="text-base-content/60 mb-3">
					{t(
						'drive.policies_help',
						"Rules an OxiCloud admin has set for this drive. Only admins can change them; you're seeing the current state."
					)}
				</p>
				<PolicyList values={drivePoliciesView} readonly testIdPrefix="drive-policy" />
			</div>
		</details>

		{#if canDelete}
			<!-- Danger zone: drive delete (D3b). Only rendered for Owners on
			     non-default drives. Backend enforces the empty-drive rule —
			     if the drive still has live content the request returns 409
			     with a message that surfaces as a toast. -->
			<div class="rounded-box border-error/50 bg-base-100 border p-5">
				<h2 class="text-error mb-4 flex items-center gap-2 text-base font-semibold">
					<Icon name="exclamation-triangle" />
					{t('drive.danger_zone', 'Danger zone')}
				</h2>
				<p class="text-base-content/60 mb-4">
					{t(
						'drive.delete_hint',
						'Deleting a drive removes it permanently. The drive must be empty (no live files or folders) before delete is allowed.'
					)}
				</p>
				<button
					type="button"
					class="btn btn-error"
					data-testid="drive-delete-btn"
					onclick={confirmAndDelete}
					disabled={deleting}
				>
					<Icon name="trash-alt" />
					{deleting ? t('common.deleting', 'Deleting…') : t('drive.delete', 'Delete drive')}
				</button>
			</div>
		{/if}
	{/if}
</div>

<!-- Drive members modal — reuses the same ShareDialog as file/folder
     sharing. `allowLinks={false}` hides the public-link tab because
     drives don't support shareable URLs (the backend service refuses
     token subjects on drive resources). -->
{#if dialogItem}
	<ShareDialog
		bind:open={shareDialogOpen}
		item={dialogItem}
		allowLinks={false}
		onchange={onShareDialogChange}
	/>
{/if}
