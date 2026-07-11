<script lang="ts" module>
	/** A group-by dimension shown in the toolbar's popup menu. */
	export interface GroupOption {
		key: string;
		label: string;
		/** Optional glyph for the menu option (defaults to the group glyph). */
		icon?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { files as filesStore } from '$lib/stores/files.svelte';

	interface Props {
		/** Group-by dimensions; omit/empty to hide the group-by control. */
		groups?: GroupOption[];
		/** Active group-by key (controlled by the parent). */
		groupBy?: string;
		/** Whether the sort direction is reversed (controlled by the parent). */
		reversed?: boolean;
		/** Fired when a group-by dimension is chosen. */
		ongroup?: (key: string) => void;
		/** Fired when the sort-direction toggle is clicked. */
		ondirection?: () => void;
		/** Show the grid/list view toggle (default true). */
		showViewToggle?: boolean;
		/** Left-hand actions (upload/new-folder/empty-trash/batch bar, …). */
		start?: Snippet;
	}

	let {
		groups,
		groupBy = '',
		reversed = false,
		ongroup,
		ondirection,
		showViewToggle = true,
		start
	}: Props = $props();

	// The group-by button always reflects the active dimension (default = first).
	const active = $derived(groups?.find((g) => g.key === groupBy) ?? groups?.[0]);
	let menuOpen = $state(false);

	// Close the popup on outside click. `.group-by-selector` is an unstyled
	// behaviour hook, not a styling class.
	$effect(() => {
		if (!menuOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!(e.target as HTMLElement).closest('.group-by-selector')) menuOpen = false;
		};
		window.addEventListener('pointerdown', onDown);
		return () => window.removeEventListener('pointerdown', onDown);
	});

	function pick(key: string) {
		menuOpen = false;
		ongroup?.(key);
	}
</script>

<div class="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-2 py-1">
	{#if start}{@render start()}{:else}<div class="flex items-center gap-2"></div>{/if}

	{#if groups?.length || showViewToggle}
		<div
			class="bg-base-200 border-base-300 flex items-center gap-0.5 rounded-xl border p-[3px]"
			role="group"
			aria-label={t('view.label', 'View options')}
		>
			{#if groups?.length}
				<div
					class="group-by-selector relative flex items-center gap-0.5"
					data-testid="list-toolbar-groupby-menu"
				>
					<button
						class="btn btn-sm btn-ghost gap-1.5 normal-case"
						title={t('groupby.title', 'Group by')}
						aria-haspopup="true"
						aria-expanded={menuOpen}
						data-testid="list-toolbar-groupby-btn"
						onclick={() => (menuOpen = !menuOpen)}
					>
						<Icon name={active?.icon ?? 'layer-group'} />
						<span class="hidden sm:inline">{active?.label ?? ''}</span>
					</button>
					<button
						class="btn btn-sm btn-square btn-ghost {reversed ? 'btn-active' : ''}"
						title={t('sortdir.title', 'Sort direction')}
						aria-label={t('sort.direction', 'Sort direction')}
						data-testid="list-toolbar-sort-direction-btn"
						onclick={() => ondirection?.()}
					>
						<Icon name="arrow-up" class="transition-transform {reversed ? 'rotate-180' : ''}" />
					</button>
					{#if menuOpen}
						<div
							class="bg-base-100 border-base-300 rounded-box absolute top-full right-0 z-20 mt-1 flex w-52 flex-col p-1 shadow-lg"
						>
							{#each groups as g (g.key)}
								<button
									class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm {groupBy ===
									g.key
										? 'bg-base-200 text-primary font-semibold'
										: ''}"
									data-testid={`list-toolbar-groupby-${g.key}-item`}
									onclick={() => pick(g.key)}
								>
									<Icon name={g.icon ?? 'layer-group'} />
									{g.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				{#if showViewToggle}<span class="bg-base-300 mx-1 h-5 w-px"></span>{/if}
			{/if}
			{#if showViewToggle}
				<button
					class="btn btn-sm btn-square btn-ghost {filesStore.viewMode === 'grid'
						? 'btn-active'
						: ''}"
					title={t('view.grid', 'Grid view')}
					aria-pressed={filesStore.viewMode === 'grid'}
					data-testid="list-toolbar-view-grid-btn"
					onclick={() => filesStore.setViewMode('grid')}><Icon name="th" /></button
				>
				<button
					class="btn btn-sm btn-square btn-ghost {filesStore.viewMode === 'list'
						? 'btn-active'
						: ''}"
					title={t('view.list', 'List view')}
					aria-pressed={filesStore.viewMode === 'list'}
					data-testid="list-toolbar-view-list-btn"
					onclick={() => filesStore.setViewMode('list')}><Icon name="list" /></button
				>
			{/if}
		</div>
	{/if}
</div>
