<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { errorMessage, errorToast } from '$lib/utils/errors';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		displayRole,
		expiryToIso,
		fetchMyShares,
		notifyGrantRecipient,
		revokeGrant,
		updateGrantRole,
		type NotifyOutcome,
		type OutgoingGrantItem,
		type OutgoingResourceGrant,
		type ShareRole
	} from '$lib/api/endpoints/grants';
	import { copyShareLink, deleteShare, getShareById, updateShare } from '$lib/api/endpoints/shares';
	import { ensureResolvers, resolveLabel } from '$lib/api/endpoints/recipients';
	import { fileInlineUrl } from '$lib/api/endpoints/files';
	import type { FileItem, FolderItem } from '$lib/api/types';
	import type { GrantResourceType } from '$lib/api/endpoints/grants';
	import Icon from '$lib/icons/Icon.svelte';
	import ListToolbar from '$lib/components/ListToolbar.svelte';
	import { lazyComponent } from '$lib/composables/lazyComponent.svelte';
	import UserVignette from '$lib/components/UserVignette.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { iconNameFromClass } from '$lib/utils/display';

	type GroupBy = 'items' | 'sharedWith';

	const GROUP_BYS: { key: GroupBy; label: string; orderBy: string }[] = [
		{ key: 'items', label: t('groupby.byFiles', 'By files'), orderBy: 'type' },
		{ key: 'sharedWith', label: t('groupby.sharedWith', 'Shared with'), orderBy: 'subject' }
	];

	const ROLES: { v: ShareRole; l: string; icon: string }[] = [
		{ v: 'owner', l: t('share.role.canManage', 'Can manage'), icon: 'crown' },
		{ v: 'editor', l: t('share.role.canEdit', 'Can edit'), icon: 'pencil-alt' },
		{ v: 'viewer', l: t('share.role.canView', 'Can view'), icon: 'eye' }
	];
	function roleMeta(r: string) {
		return ROLES.find((x) => x.v === displayRole(r)) ?? ROLES[2];
	}

	/** Role pill tint (was `.ms-role--*`): manage=warning, edit=primary, view=neutral. */
	const ROLE_BADGE: Record<ShareRole, string> = {
		owner: 'badge-soft badge-warning',
		editor: 'badge-soft badge-primary',
		viewer: 'badge-ghost'
	};

	let raw = $state<OutgoingGrantItem[]>([]);
	let cursor = $state<string | undefined>(undefined);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let groupBy = $state<GroupBy>('items');
	let reversed = $state(false);

	// Edit-sharing dialog
	let dialogOpen = $state(false);
	let dialogItem = $state<{ id: string; name: string; kind: GrantResourceType } | null>(null);

	// ShareDialog is heavy and only opens on demand — keep it out of this route's
	// initial chunk and load it the first time the dialog is opened.
	const shareDialog = lazyComponent(() => import('$lib/components/ShareDialog.svelte'));
	$effect(() => {
		if (dialogOpen) void shareDialog.load();
	});

	// Open kebab menu, keyed by grant id.
	let menuFor = $state<string | null>(null);

	function expiryTier(iso: string | null | undefined): 'never' | 'active' | 'soon' | 'expired' {
		if (!iso) return 'never';
		const ms = new Date(iso).getTime() - Date.now();
		if (ms < 0) return 'expired';
		if (ms <= 30 * 86_400_000) return 'soon';
		return 'active';
	}
	/** Expiry chip tint (was `.ms-expiry--*`). */
	const EXPIRY_BADGE: Record<string, string> = {
		never: 'badge-ghost',
		active: 'badge-ghost',
		soon: 'badge-soft badge-warning',
		expired: 'badge-soft badge-error'
	};
	function expiryLabel(iso: string | null | undefined): string {
		if (!iso) return t('share.noExpiry', 'No expiry');
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
	function isoToDate(iso: string | null | undefined): string {
		return iso ? String(iso).slice(0, 10) : '';
	}

	// ── Swimlane assembly ───────────────────────────────────────────────────
	interface Lane {
		key: string;
		header:
			| { kind: 'resource'; item: OutgoingGrantItem }
			| { kind: 'user'; id: string }
			| { kind: 'group'; id: string }
			| { kind: 'linkPublic' }
			| { kind: 'linkPassword' };
		rows: { grant: OutgoingResourceGrant; item: OutgoingGrantItem }[];
	}

	const lanes = $derived.by((): Lane[] => {
		const out: Lane[] = [];
		// Transient scratch map built inside $derived.by and discarded — not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byKey = new Map<string, Lane>();
		const ensure = (key: string, header: Lane['header']): Lane => {
			let lane = byKey.get(key);
			if (!lane) {
				lane = { key, header, rows: [] };
				byKey.set(key, lane);
				out.push(lane);
			}
			return lane;
		};
		for (const item of raw) {
			if (groupBy === 'items') {
				const lane = ensure(`resource:${item.resource.id}`, { kind: 'resource', item });
				for (const grant of item.grants) lane.rows.push({ grant, item });
			} else {
				for (const grant of item.grants) {
					let key: string;
					let header: Lane['header'];
					if (grant.subject_type === 'user') {
						key = `user:${grant.subject_id}`;
						header = { kind: 'user', id: grant.subject_id };
					} else if (grant.subject_type === 'group') {
						key = `group:${grant.subject_id}`;
						header = { kind: 'group', id: grant.subject_id };
					} else if (grant.has_password) {
						key = 'links:password';
						header = { kind: 'linkPassword' };
					} else {
						key = 'links:public';
						header = { kind: 'linkPublic' };
					}
					ensure(key, header).rows.push({ grant, item });
				}
			}
		}
		return out;
	});

	function laneTitle(header: Lane['header']): string {
		switch (header.kind) {
			case 'user':
				return resolveLabel('user', header.id);
			case 'group':
				return resolveLabel('group', header.id);
			case 'linkPublic':
				return t('myshares.publicLinks', 'Public links');
			case 'linkPassword':
				return t('myshares.passwordLinks', 'Password-protected links');
			case 'resource':
				return header.item.resource.name;
		}
	}

	// ── Data loading ────────────────────────────────────────────────────────
	async function load(reset = false) {
		loading = true;
		error = null;
		try {
			await ensureResolvers();
			const order = GROUP_BYS.find((g) => g.key === groupBy)?.orderBy;
			const page = await fetchMyShares({
				cursor: reset ? undefined : cursor,
				orderBy: order,
				reverse: reversed
			});
			raw = reset ? page.items : [...raw, ...page.items];
			cursor = page.next_cursor;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loading = false;
		}
	}

	function reload() {
		cursor = undefined;
		raw = [];
		void load(true);
	}

	function setGroupBy(key: GroupBy) {
		if (groupBy === key) return;
		groupBy = key;
		reload();
	}
	function toggleDirection() {
		reversed = !reversed;
		reload();
	}

	function openResource(item: OutgoingGrantItem) {
		// Drives don't have a Files-page deep-link the same way folders do
		// (their id is the drive UUID, not a folder UUID); route to the
		// per-drive settings page so the user lands somewhere meaningful.
		if (item.resource_type === 'drive') {
			goto(resolve(`/config/drive/${item.resource.id}`));
			return;
		}
		if (item.resource_type === 'folder') goto(resolve(`/files/${item.resource.id}`));
		else window.open(fileInlineUrl(item.resource.id), '_blank', 'noopener');
	}

	function editSharing(item: OutgoingGrantItem) {
		dialogItem = { id: item.resource.id, name: item.resource.name, kind: item.resource_type };
		dialogOpen = true;
	}

	function toggleMenu(grantId: string) {
		menuFor = menuFor === grantId ? null : grantId;
	}
	function closeMenu() {
		menuFor = null;
	}

	function summarize(outcomes: NotifyOutcome[]) {
		if (!outcomes || outcomes.length === 0) {
			ui.notify(t('myshares.notifySent', 'Notification sent.'), 'success');
			return;
		}
		const sent = outcomes.filter((o) => o.kind === 'sent').length;
		const coalesced = outcomes.filter((o) => o.kind === 'coalesced').length;
		const rate = outcomes.filter((o) => o.kind === 'rate_limited').length;
		const skipped = outcomes.filter((o) => o.kind === 'not_applicable').length;
		const lines: string[] = [];
		if (sent > 0) lines.push(t('share.notify.sent', { n: sent }, '{{n}} notified by email.'));
		if (coalesced > 0)
			lines.push(t('share.notify.coalesced', { n: coalesced }, '{{n}} already notified recently.'));
		if (rate > 0)
			lines.push(
				t('share.notify.rateLimited', { n: rate }, '{{n}} hit the rate limit — try later.')
			);
		if (skipped > 0)
			lines.push(
				t('share.notify.skipped', { n: skipped }, '{{n}} skipped (no email / opted out).')
			);
		ui.notify(
			lines.join(' ') || t('myshares.notifySent', 'Notification sent.'),
			rate || skipped ? 'info' : 'success'
		);
	}

	// ── Per-grant actions ───────────────────────────────────────────────────
	async function changeRole(g: OutgoingResourceGrant, item: OutgoingGrantItem, role: ShareRole) {
		closeMenu();
		if (g.role === role) return;
		try {
			await updateGrantRole(
				{ type: g.subject_type, id: g.subject_id },
				{ type: item.resource_type, id: item.resource.id },
				role,
				expiryToIso(isoToDate(g.expires_at) || null)
			);
			g.role = role;
			raw = [...raw];
		} catch (e) {
			errorToast(e);
		}
	}

	async function changeExpiry(g: OutgoingResourceGrant, item: OutgoingGrantItem, date: string) {
		try {
			const iso = expiryToIso(date || null);
			await updateGrantRole(
				{ type: g.subject_type, id: g.subject_id },
				{ type: item.resource_type, id: item.resource.id },
				g.role,
				iso
			);
			g.expires_at = iso;
			raw = [...raw];
		} catch (e) {
			errorToast(e);
		}
	}

	async function notify(g: OutgoingResourceGrant) {
		closeMenu();
		try {
			summarize((await notifyGrantRecipient(g.grant_id)).outcomes);
		} catch (e) {
			errorToast(e);
		}
	}

	async function removeAccess(g: OutgoingResourceGrant) {
		closeMenu();
		try {
			await revokeGrant(g.grant_id);
			dropGrant(g.grant_id);
		} catch (e) {
			errorToast(e);
		}
	}

	async function copyLink(g: OutgoingResourceGrant) {
		closeMenu();
		try {
			const share = await getShareById(g.subject_id);
			if (await copyShareLink(share.url)) ui.notify(t('share.copied', 'Link copied'), 'success');
			else ui.notify(t('share.copy_failed', 'Could not copy link'), 'error');
		} catch (e) {
			errorToast(e);
		}
	}

	async function changeLinkExpiry(g: OutgoingResourceGrant, date: string) {
		try {
			await updateShare(g.subject_id, { expiresAt: date || null });
			g.expires_at = expiryToIso(date || null);
			raw = [...raw];
		} catch (e) {
			errorToast(e);
		}
	}

	async function editLinkPassword(g: OutgoingResourceGrant) {
		closeMenu();
		const pw = window.prompt(
			g.has_password
				? t('share.passwordPrompt_clear', 'New password (blank to remove):')
				: t('share.passwordPrompt', 'Set a password:')
		);
		if (pw === null) return;
		try {
			await updateShare(g.subject_id, { password: pw || null });
			g.has_password = !!pw;
			raw = [...raw];
			ui.notify(
				pw
					? t('share.password_set', 'Password updated')
					: t('share.password_cleared', 'Password removed'),
				'success'
			);
		} catch (e) {
			errorToast(e);
		}
	}

	async function deleteLink(g: OutgoingResourceGrant) {
		closeMenu();
		try {
			await deleteShare(g.subject_id);
			dropGrant(g.grant_id);
		} catch (e) {
			errorToast(e);
		}
	}

	/** Remove a grant locally, pruning now-empty resources. */
	function dropGrant(grantId: string) {
		raw = raw
			.map((item) => ({ ...item, grants: item.grants.filter((g) => g.grant_id !== grantId) }))
			.filter((item) => item.grants.length > 0);
	}

	function linkLabel(g: OutgoingResourceGrant): string {
		return `${t('share.link', 'Link')} · …${g.subject_id.slice(-4)} · ${g.subject_display}`;
	}

	function resourceIcon(item: OutgoingGrantItem): string {
		// Drives use the `hdd` glyph (shared with DrivePicker / breadcrumb)
		// so a shared drive reads as a distinct kind at a glance — folder
		// and drive both grant access to a tree, but the scope is very
		// different.
		if (item.resource_type === 'drive') return 'hdd';
		return item.resource_type === 'folder'
			? 'folder'
			: iconNameFromClass((item.resource as FileItem | FolderItem).icon_class);
	}

	const MENU_ITEM_CLASS =
		'hover:bg-base-200 text-base-content flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left';

	const isEmpty = $derived(!loading && raw.length === 0 && !error);

	onMount(() => load(true));
</script>

<svelte:head><title>{t('nav.shared', 'Shared')} · OxiCloud</title></svelte:head>
<svelte:window onclick={() => menuFor && closeMenu()} />

<div class="bg-base-100 sticky -top-5 z-10 py-2.5">
	<h1 class="text-base-content mb-5 text-2xl font-bold">{t('nav.shared', 'Shared')}</h1>
	<ListToolbar
		groups={GROUP_BYS}
		{groupBy}
		{reversed}
		ongroup={(key) => setGroupBy(key as GroupBy)}
		ondirection={toggleDirection}
		showViewToggle={false}
	/>
</div>

{#if error}
	<EmptyState icon="exclamation-circle" title={error} error />
{:else if isEmpty}
	<EmptyState
		icon="share-alt"
		title={t('myshares.emptyStateTitle', "You haven't shared anything yet")}
		hint={t('myshares.emptyStateDesc', 'Items you share with others will appear here')}
	/>
{:else}
	<div class="flex flex-col gap-4 pt-3">
		{#each lanes as lane (lane.key)}
			<section class="border-base-300 rounded-box overflow-visible border">
				<header
					class="border-base-300/60 bg-base-200 flex items-center justify-between gap-2 border-b px-3 py-2"
				>
					{#if lane.header.kind === 'resource'}
						{@const laneItem = lane.header.item}
						<button
							class="text-base-content flex min-w-0 cursor-pointer items-center gap-2 border-none bg-transparent font-semibold"
							data-testid={`shared-lane-open-${laneItem.resource.id}`}
							onclick={() => openResource(laneItem)}
						>
							<Icon name={resourceIcon(laneItem)} />
							<span class="truncate">{laneItem.resource.name}</span>
						</button>
						<button
							class="btn btn-sm flex-none gap-1"
							data-testid={`shared-edit-sharing-${laneItem.resource.id}`}
							onclick={() => editSharing(laneItem)}
						>
							<Icon name="pencil-alt" />
							{t('myshares.editSharing', 'Edit sharing')}
						</button>
					{:else if lane.header.kind === 'user'}
						<span class="text-base-content flex min-w-0 items-center gap-2 font-semibold">
							<UserVignette
								userId={lane.header.id}
								fallbackLabel={resolveLabel('user', lane.header.id)}
							/>
						</span>
					{:else}
						<span class="text-base-content flex min-w-0 items-center gap-2 font-semibold">
							<Icon
								name={lane.header.kind === 'group'
									? 'user-group'
									: lane.header.kind === 'linkPassword'
										? 'lock'
										: 'link'}
							/>
							<span class="truncate">{laneTitle(lane.header)}</span>
						</span>
					{/if}
				</header>

				<ul class="m-0 flex list-none flex-col p-0">
					{#each lane.rows as { grant, item } (grant.grant_id)}
						{@const tier = expiryTier(grant.expires_at)}
						<li
							class="border-base-300/60 flex items-center gap-2 border-t px-3 py-2 first:border-t-0 {tier ===
							'expired'
								? 'opacity-60'
								: ''}"
						>
							<!-- Identity -->
							<span class="flex min-w-0 flex-1 items-center gap-2">
								{#if (grant.subject_type === 'user' || grant.subject_type === 'group') && groupBy === 'sharedWith'}
									<button
										class="text-base-content flex min-w-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0"
										data-testid={`shared-row-open-${grant.grant_id}`}
										onclick={() => openResource(item)}
									>
										<Icon name={resourceIcon(item)} />
										<span class="truncate">{item.resource.name}</span>
									</button>
								{:else if grant.subject_type === 'user'}
									<UserVignette
										userId={grant.subject_id}
										fallbackLabel={resolveLabel('user', grant.subject_id)}
									/>
								{:else if grant.subject_type === 'group'}
									<Icon name="user-group" />
									<span class="truncate">{resolveLabel('group', grant.subject_id)}</span>
								{:else}
									<button
										class="border-base-300 flex min-w-0 cursor-pointer items-center gap-1 rounded-full border bg-transparent px-2 py-1 {grant.has_password
											? 'text-primary'
											: 'text-base-content'}"
										data-testid={`shared-copy-link-${grant.grant_id}`}
										onclick={() => copyLink(grant)}
										title={t('share.copyLink', 'Copy link')}
									>
										<Icon name={grant.has_password ? 'lock' : 'link'} />
										<span class="truncate">{linkLabel(grant)}</span>
									</button>
									{#if groupBy === 'sharedWith'}
										<span class="text-base-content/60">→</span>
										<button
											class="text-base-content flex min-w-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0"
											data-testid={`shared-link-open-${grant.grant_id}`}
											onclick={() => openResource(item)}
										>
											<Icon name={resourceIcon(item)} />
											<span>{item.resource.name}</span>
										</button>
									{/if}
								{/if}
							</span>

							<!-- Role pill (not shown for token subjects) -->
							{#if grant.subject_type !== 'token'}
								<span class="badge badge-sm flex-none gap-1 {ROLE_BADGE[roleMeta(grant.role).v]}">
									<Icon name={roleMeta(grant.role).icon} />
									{roleMeta(grant.role).l}
								</span>
							{/if}

							<!-- Expiry chip -->
							<span
								class="badge badge-sm flex-none gap-1 {EXPIRY_BADGE[tier]}"
								title={expiryLabel(grant.expires_at)}
							>
								<Icon name={grant.expires_at ? 'clock' : 'infinity'} />
								{expiryLabel(grant.expires_at)}
							</span>

							<!-- Kebab -->
							<div class="relative flex-none">
								<button
									class="btn btn-ghost btn-sm btn-square text-base-content/70"
									aria-label={t('myshares.manageAccess', 'Manage access')}
									aria-haspopup="menu"
									aria-expanded={menuFor === grant.grant_id}
									data-testid={`shared-kebab-${grant.grant_id}`}
									onclick={(e) => {
										e.stopPropagation();
										toggleMenu(grant.grant_id);
									}}><Icon name="ellipsis-v" /></button
								>
								{#if menuFor === grant.grant_id}
									<div
										class="bg-base-100 border-base-300 rounded-box absolute top-full right-0 z-50 mt-1 flex min-w-56 flex-col p-1 shadow-lg"
										role="menu"
										tabindex="-1"
										data-testid={`shared-menu-${grant.grant_id}`}
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.key === 'Escape' && closeMenu()}
									>
										{#if grant.subject_type === 'user' || grant.subject_type === 'group'}
											<button
												class={MENU_ITEM_CLASS}
												role="menuitem"
												data-testid={`shared-notify-${grant.grant_id}`}
												onclick={() => notify(grant)}
											>
												<Icon name="paper-plane" />
												{grant.subject_type === 'group'
													? t('myshares.notifyGroupMembers', 'Notify group members')
													: grant.is_external
														? t('myshares.resendInvitation', 'Resend invitation email')
														: t('myshares.notifyByEmail', 'Notify by email')}
											</button>
											<div class="bg-base-300 my-1 h-px"></div>
											{#each ROLES as r (r.v)}
												<button
													class="{MENU_ITEM_CLASS} {grant.role === r.v ? 'font-semibold' : ''}"
													role="menuitem"
													data-testid={`shared-role-${r.v}-${grant.grant_id}`}
													onclick={() => changeRole(grant, item, r.v)}
												>
													<Icon name={grant.role === r.v ? 'check' : r.icon} />
													{r.l}
												</button>
											{/each}
											<div class="bg-base-300 my-1 h-px"></div>
											<div class="flex items-center justify-between gap-2 px-3 py-2">
												<span class="text-base-content/60 text-sm"
													>{t('share.expiry', 'Expiry')}</span
												>
												<input
													type="date"
													class="input input-sm"
													data-testid={`shared-expiry-${grant.grant_id}-input`}
													value={isoToDate(grant.expires_at)}
													onchange={(e) =>
														changeExpiry(grant, item, (e.currentTarget as HTMLInputElement).value)}
												/>
											</div>
											<div class="bg-base-300 my-1 h-px"></div>
											<button
												class="{MENU_ITEM_CLASS} text-error"
												role="menuitem"
												data-testid={`shared-remove-access-${grant.grant_id}`}
												onclick={() => removeAccess(grant)}
											>
												<Icon name="user-xmark" />
												{t('myshares.removeAccess', 'Remove access')}
											</button>
										{:else}
											<button
												class={MENU_ITEM_CLASS}
												role="menuitem"
												data-testid={`shared-menu-copy-link-${grant.grant_id}`}
												onclick={() => copyLink(grant)}
											>
												<Icon name="copy" />
												{t('myshares.copyLink', 'Copy link')}
											</button>
											<div class="bg-base-300 my-1 h-px"></div>
											<div class="flex items-center justify-between gap-2 px-3 py-2">
												<span class="text-base-content/60 text-sm"
													>{t('share.expiry', 'Expiry')}</span
												>
												<input
													type="date"
													class="input input-sm"
													data-testid={`shared-link-expiry-${grant.grant_id}-input`}
													value={isoToDate(grant.expires_at)}
													onchange={(e) =>
														changeLinkExpiry(grant, (e.currentTarget as HTMLInputElement).value)}
												/>
											</div>
											<button
												class={MENU_ITEM_CLASS}
												role="menuitem"
												data-testid={`shared-edit-password-${grant.grant_id}`}
												onclick={() => editLinkPassword(grant)}
											>
												<Icon name={grant.has_password ? 'lock' : 'lock-open'} />
												{grant.has_password
													? t('share.changePassword', 'Change password')
													: t('share.addPassword', 'Add password')}
											</button>
											<div class="bg-base-300 my-1 h-px"></div>
											<button
												class="{MENU_ITEM_CLASS} text-error"
												role="menuitem"
												data-testid={`shared-delete-link-${grant.grant_id}`}
												onclick={() => deleteLink(grant)}
											>
												<Icon name="trash" />
												{t('myshares.deleteLink', 'Delete link')}
											</button>
										{/if}
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if cursor}
			<button
				class="btn btn-sm mx-auto mt-3"
				data-testid="shared-load-more-btn"
				onclick={() => load(false)}
				disabled={loading}
			>
				{loading ? t('common.loading', 'Loading…') : t('common.load_more', 'Load more')}
			</button>
		{/if}
	</div>
{/if}

{#if shareDialog.component}
	{@const ShareDialog = shareDialog.component}
	<!-- Drives don't support shareable URLs — hide the Public-link tab
	     when the dialog is opened for a drive resource. File/folder
	     resources keep the default tab set. -->
	<ShareDialog bind:open={dialogOpen} item={dialogItem} allowLinks={dialogItem?.kind !== 'drive'} />
{/if}
