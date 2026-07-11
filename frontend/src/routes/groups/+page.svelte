<script lang="ts">
	import { errorMessage, errorToast } from '$lib/utils/errors';
	import { onMount } from 'svelte';
	import {
		addGroupMember,
		addUserMember,
		createGroup,
		deleteGroup,
		groupDescription,
		groupDisplayName,
		groupIconName,
		INTERNAL_GROUP_ID,
		listGroupsPage,
		listMembers,
		removeGroupMember,
		removeUserMember,
		renameGroup,
		type GroupItem,
		type GroupMember
	} from '$lib/api/endpoints/groups';
	import {
		ensureResolvers,
		resolveRecipient,
		searchRecipients,
		type Recipient
	} from '$lib/api/endpoints/recipients';
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { promptDialog } from '$lib/stores/dialogs.svelte';
	import { ui } from '$lib/stores/ui.svelte';

	const PAGE_SIZE = 50;

	let groups = $state<GroupItem[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let expandedId = $state<string | null>(null);
	let members = $state<GroupMember[]>([]);
	let resolverReady = $state(false);

	const hasMore = $derived(groups.length < total);

	// Add-member combobox state (scoped to the expanded group)
	let addQuery = $state('');
	let addResults = $state<Recipient[]>([]);
	let addBusy = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	// Repeated class strings (was `.muted` / `.link-btn` / `.avatar` BEM rules).
	const MUTED_CLASS = 'text-base-content/60 text-[0.8125rem]';
	const LINK_BTN_CLASS =
		'text-primary cursor-pointer border-none bg-transparent p-0 text-[0.8125rem] hover:underline';
	const DANGER_LINK_BTN_CLASS =
		'text-error cursor-pointer border-none bg-transparent p-0 text-[0.8125rem] hover:underline';
	const AVATAR_CLASS =
		'bg-primary/10 text-primary grid shrink-0 place-items-center rounded-full text-xs';

	async function load() {
		loading = true;
		error = null;
		try {
			const page = await listGroupsPage(PAGE_SIZE, 0);
			groups = page.items;
			total = page.total;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		loadingMore = true;
		try {
			const page = await listGroupsPage(PAGE_SIZE, groups.length);
			groups = [...groups, ...page.items];
			total = page.total;
		} catch (e) {
			report(e);
		} finally {
			loadingMore = false;
		}
	}

	function report(e: unknown) {
		errorToast(e);
	}

	/** Localised "(N members)" label. Project i18n has no plural rules, so we
	 *  branch on the three named forms ourselves. */
	function memberCountLabel(count: number): string {
		if (count === 0) return t('groups.member_count_zero', 'no members');
		if (count === 1) return t('groups.member_count_one', '1 member');
		return t('groups.member_count_other', { count }, '{{count}} members');
	}

	/** Display info for a member row; falls back to the raw id until caches load. */
	function memberInfo(m: GroupMember): { label: string; sublabel?: string } {
		// resolverReady gates re-resolution once the caches are populated.
		void resolverReady;
		const r = resolveRecipient(m.kind, m.id);
		return { label: r.label, sublabel: r.sublabel };
	}

	async function expand(g: GroupItem) {
		addQuery = '';
		addResults = [];
		if (expandedId === g.id) {
			expandedId = null;
			return;
		}
		expandedId = g.id;
		try {
			members = await listMembers(g.id);
		} catch (e) {
			report(e);
			members = [];
		}
	}

	async function onCreate() {
		const name = await promptDialog({
			title: t('groups.create_dialog_title', 'New group'),
			placeholder: t('groups.name_placeholder', 'engineering'),
			confirmText: t('actions.create', 'Create')
		});
		if (!name || !name.trim()) return;
		try {
			await createGroup(name.trim());
			await load();
		} catch (e) {
			report(e);
		}
	}

	async function onRename(g: GroupItem) {
		const name = await promptDialog({
			title: t('groups.edit_dialog_title', 'Rename group'),
			defaultValue: g.name,
			placeholder: t('groups.name_placeholder', 'engineering'),
			confirmText: t('actions.rename', 'Rename')
		});
		if (!name || !name.trim() || name.trim() === g.name) return;
		try {
			await renameGroup(g.id, name.trim());
			await load();
		} catch (e) {
			report(e);
		}
	}

	async function onDelete(g: GroupItem) {
		// Typed-name confirmation: the user must type the exact group name.
		const typed = await promptDialog({
			title: t('groups.delete_group', 'Delete group'),
			message: t(
				'groups.delete_confirm',
				{ name: g.name },
				'Delete the group "{{name}}"? Type the group name to confirm.'
			),
			placeholder: g.name,
			confirmText: t('actions.delete', 'Delete')
		});
		if (typed === null) return;
		if (typed !== g.name) {
			ui.notify(
				t('groups.delete_confirm_mismatch', 'Type the group name exactly to confirm.'),
				'error'
			);
			return;
		}
		try {
			await deleteGroup(g.id);
			if (expandedId === g.id) expandedId = null;
			await load();
		} catch (e) {
			report(e);
		}
	}

	function onAddQuery() {
		if (searchTimer) clearTimeout(searchTimer);
		const q = addQuery;
		if (!q.trim()) {
			addResults = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			addBusy = true;
			try {
				const all = await searchRecipients(q);
				// Don't offer the group as a member of itself, or current members.
				const existing = new Set(members.map((m) => m.id));
				addResults = all.filter((r) => r.id !== expandedId && !existing.has(r.id));
			} catch (e) {
				report(e);
			} finally {
				addBusy = false;
			}
		}, 200);
	}

	async function pickMember(g: GroupItem, r: Recipient) {
		try {
			if (r.type === 'group') await addGroupMember(g.id, r.id);
			else await addUserMember(g.id, r.id);
			addQuery = '';
			addResults = [];
			members = await listMembers(g.id);
		} catch (e) {
			report(e);
		}
	}

	async function onRemoveMember(groupId: string, m: GroupMember) {
		try {
			if (m.kind === 'user') await removeUserMember(groupId, m.id);
			else await removeGroupMember(groupId, m.id);
			members = await listMembers(groupId);
		} catch (e) {
			report(e);
		}
	}

	onMount(async () => {
		await load();
		try {
			await ensureResolvers();
			resolverReady = true;
		} catch {
			/* names fall back to ids */
		}
	});
</script>

<svelte:head><title>{t('nav.groups', 'Groups')} · OxiCloud</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
	<header class="flex items-center justify-between">
		<h1 class="text-base-content m-0 text-2xl font-bold">{t('nav.groups', 'Groups')}</h1>
		<button class="btn btn-primary" data-testid="groups-create-btn" onclick={onCreate}
			>{t('groups.create', 'Create group')}</button
		>
	</header>

	{#if error}
		<p class="text-error py-8 text-center" role="alert">{error}</p>
	{:else if loading}
		<p class="text-base-content/60 py-8 text-center">{t('common.loading', 'Loading…')}</p>
	{:else if groups.length === 0}
		<p class="text-base-content/60 py-8 text-center">{t('groups.empty', 'No groups yet.')}</p>
	{:else}
		<ul class="m-0 flex list-none flex-col gap-2 p-0">
			{#each groups as g (g.id)}
				{@const description = groupDescription(g)}
				<li class="border-base-300 rounded-box bg-base-100 border">
					<div class="flex items-center justify-between gap-2 p-3">
						<button
							class="text-base-content flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent text-left text-base"
							data-testid={`groups-expand-${g.id}`}
							onclick={() => expand(g)}
						>
							<span class="{AVATAR_CLASS} h-8 w-8"><Icon name={groupIconName(g)} /></span>
							<span class="flex min-w-0 flex-col gap-0.5">
								<span class="flex items-center gap-2">
									{groupDisplayName(g)}
									{#if g.is_virtual}<span class="badge badge-soft badge-warning badge-xs"
											>{t('groups.virtual_badge', 'System')}</span
										>{/if}
								</span>
								{#if description}<span class={MUTED_CLASS}>{description}</span>{/if}
								{#if !g.is_virtual && g.member_count != null}
									<span class={MUTED_CLASS}>{memberCountLabel(g.member_count)}</span>
								{/if}
							</span>
						</button>
						{#if g.can_manage !== false && !g.is_virtual}
							<div class="flex shrink-0 gap-2">
								<button
									class={LINK_BTN_CLASS}
									data-testid={`groups-rename-${g.id}`}
									onclick={() => onRename(g)}>{t('common.rename', 'Rename')}</button
								>
								<button
									class={DANGER_LINK_BTN_CLASS}
									data-testid={`groups-delete-${g.id}`}
									onclick={() => onDelete(g)}
								>
									{t('common.delete', 'Delete')}
								</button>
							</div>
						{/if}
					</div>

					{#if expandedId === g.id}
						<div class="border-base-300 border-t p-3" data-testid={`groups-members-panel-${g.id}`}>
							<div class="flex items-center justify-between">
								<h2 class="m-0 text-base font-semibold">{t('groups.members', 'Members')}</h2>
							</div>

							{#if g.can_manage !== false && !g.is_virtual}
								<div class="relative my-2">
									<input
										class="input w-full"
										data-testid="groups-member-add-input"
										placeholder={t('groups.add_member_search', 'Search users or groups to add…')}
										bind:value={addQuery}
										oninput={onAddQuery}
									/>
									{#if addBusy}
										<p class={MUTED_CLASS}>{t('common.loading', 'Loading…')}</p>
									{:else if addResults.length > 0}
										<ul
											class="border-base-300 rounded-box bg-base-100 m-0 mt-1 max-h-64 list-none overflow-auto border p-0"
											data-testid="groups-member-add-results"
										>
											{#each addResults as r (r.type + r.id)}
												<li>
													<button
														class="text-base-content hover:bg-base-200 flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left"
														data-testid={`groups-member-add-opt-${r.type}-${r.id}`}
														onclick={() => pickMember(g, r)}
													>
														<span class="{AVATAR_CLASS} h-6 w-6">
															<Icon name={r.type === 'group' ? 'user-group' : 'user'} />
														</span>
														<span class="flex min-w-0 flex-1 flex-col text-left">
															<span class="flex items-center gap-2">{r.label}</span>
															{#if r.sublabel}<span class={MUTED_CLASS}>{r.sublabel}</span>{/if}
														</span>
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{:else if g.id === INTERNAL_GROUP_ID}
								<p class={MUTED_CLASS}>
									{t('groups.virtual_internal_explanation', 'Every internal user on this server.')}
								</p>
							{/if}

							{#if members.length === 0}
								{#if !(g.id === INTERNAL_GROUP_ID)}
									<p class={MUTED_CLASS}>{t('groups.no_members', 'No members.')}</p>
								{/if}
							{:else}
								<ul class="m-0 mt-2 flex list-none flex-col gap-1 p-0">
									{#each members as m (m.kind + m.id)}
										{@const info = memberInfo(m)}
										<li class="flex items-center gap-2 py-1">
											<span class="{AVATAR_CLASS} h-6 w-6">
												<Icon name={m.kind === 'group' ? 'user-group' : 'user'} />
											</span>
											<span class="flex min-w-0 flex-1 flex-col text-left">
												<span class="flex items-center gap-2">
													{info.label}
													{#if m.kind === 'group'}<span class="badge badge-soft badge-info badge-xs"
															>{t('groups.nested', 'Group')}</span
														>{/if}
												</span>
												{#if info.sublabel}<span class={MUTED_CLASS}>{info.sublabel}</span>{/if}
											</span>
											{#if g.can_manage !== false && !g.is_virtual}
												<button
													class={DANGER_LINK_BTN_CLASS}
													data-testid={`groups-member-remove-${m.kind}-${m.id}`}
													onclick={() => onRemoveMember(g.id, m)}
												>
													{t('common.remove', 'Remove')}
												</button>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if hasMore}
			<button
				class="btn self-center"
				data-testid="groups-load-more-btn"
				disabled={loadingMore}
				onclick={loadMore}
			>
				{loadingMore ? t('common.loading', 'Loading…') : t('groups.load_more', 'Load more')}
			</button>
		{/if}
	{/if}
</main>
