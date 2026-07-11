<script lang="ts" module>
	import type { ItemType } from '$lib/api/types';

	/** Normalised row passed to ResourceList; views map their items to this. */
	export interface ResourceEntry {
		id: string;
		name: string;
		kind: ItemType;
		iconClass?: string;
		path?: string | null;
		size?: number | null;
		date?: number | string | null;
		typeLabel?: string;
		/** Owner user id — enables the owner column + vignette when `showOwner`. */
		ownerId?: string | null;
		/** Owner display name (resolved by the page). */
		ownerName?: string | null;
		/** Per-entry favorite state for the star-toggle widget. */
		isFavorite?: boolean;
		/** Stable category key (Folder / Image / …) used by the `type` group-by. */
		category?: string;
		/** Modified timestamp (epoch seconds/ms or ISO) for the `modifiedAt` group-by. */
		modifiedAt?: number | string | null;
	}

	/**
	 * A group-by ("swimlane") dimension a page can offer. `orderBy` is sent to the
	 * API; the optional `bucketOf` maps an entry to a section key, and `labelOf`
	 * maps that key to a header label. Omitting `bucketOf` means a flat list.
	 */
	export interface GroupByDef {
		key: string;
		label: string;
		orderBy: string;
		/** Optional icon for the dropdown option (defaults to the group glyph). */
		icon?: string;
		bucketOf?: (entry: ResourceEntry) => string | null;
		labelOf?: (bucketKey: string) => string;
	}

	/** A right-click / overflow context-menu action. */
	export interface ContextAction {
		key: string;
		label: string;
		icon: string;
		danger?: boolean;
		run: (entry: ResourceEntry) => void;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Icon from '$lib/icons/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SkeletonList from '$lib/components/SkeletonList.svelte';
	import ListToolbar from '$lib/components/ListToolbar.svelte';
	import UserVignette from '$lib/components/UserVignette.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { files as filesStore } from '$lib/stores/files.svelte';
	import { formatBytes } from '$lib/utils/format';
	import { formatDate, iconNameFromClass, fileIconKind } from '$lib/utils/display';
	import { gridColumns } from '$lib/utils/grid';

	interface Props {
		title: string;
		items: ResourceEntry[];
		loading?: boolean;
		error?: string | null;
		/** Empty-state primary line. */
		emptyText?: string;
		/** Empty-state secondary hint line. */
		emptyHint?: string;
		/** Empty-state icon-registry name (e.g. "star", "clock", "trash"). */
		emptyIcon?: string;
		hasMore?: boolean;
		onloadmore?: () => void;
		/** Show the path/location column (list view only). */
		showPath?: boolean;
		/** Override the path column header label (e.g. trash → "Original location"). */
		pathLabel?: string;
		showSize?: boolean;
		showType?: boolean;
		showDate?: boolean;
		/** Override the date column header label (e.g. trash → "Remaining"). */
		dateLabel?: string;
		/** Custom renderer for the date cell (e.g. trash expiry chip). */
		dateCell?: Snippet<[ResourceEntry]>;
		/**
		 * Optional per-bucket action button rendered alongside the swimlane
		 * header label. Receives the bucket key (the value `bucketOf`
		 * returned for the active group-by). Used by the trash page to expose
		 * a per-drive "Empty" affordance — the page decides which group-bys
		 * the action is meaningful for and returns nothing otherwise.
		 */
		bucketAction?: Snippet<[string]>;
		/** Show the owner column + vignette (list view) and hover tooltip. */
		showOwner?: boolean;
		/** Allow grid/list toggle (shares the app-wide view mode). */
		showViewToggle?: boolean;
		/** Multi-select checkboxes + selection model. */
		selectable?: boolean;
		/** Right-click / overflow context-menu actions. */
		contextActions?: ContextAction[];
		/** Group-by dimensions; when provided, a swimlane selector is shown. */
		groupBys?: GroupByDef[];
		/** Active group-by key (bind:groupBy from the page). */
		groupBy?: string;
		/** Reverse sort toggle state (bind:reversed from the page). */
		reversed?: boolean;
		/** Called when group-by or direction changes; page should reload page 1. */
		onreload?: (orderBy: string, reversed: boolean) => void;
		onopen?: (entry: ResourceEntry) => void;
		/** Per-entry favorite star toggle. */
		onfavorite?: (entry: ResourceEntry) => void;
		/** Selection changed (set of selected entry ids). */
		onselectionchange?: (ids: Set<string>) => void;
		actions?: Snippet<[ResourceEntry]>;
		toolbar?: Snippet;
		/** Batch toolbar shown when items are selected; receives selected entries. */
		batchToolbar?: Snippet<[ResourceEntry[]]>;
	}

	let {
		title,
		items,
		loading = false,
		error = null,
		emptyText,
		emptyHint,
		emptyIcon,
		hasMore = false,
		onloadmore,
		showPath = true,
		pathLabel,
		showSize = true,
		showType = false,
		showDate = true,
		dateLabel,
		dateCell,
		bucketAction,
		showOwner = false,
		showViewToggle = true,
		selectable = false,
		contextActions,
		groupBys,
		groupBy = $bindable(''),
		reversed = $bindable(false),
		onreload,
		onopen,
		onfavorite,
		onselectionchange,
		actions,
		toolbar,
		batchToolbar
	}: Props = $props();

	const isEmpty = $derived(items.length === 0);
	const isGrid = $derived(filesStore.viewMode === 'grid');
	/** Content width, for computing the grid's column count to match auto-fill. */
	let gridWidth = $state(0);
	const gridCols = $derived(gridColumns(gridWidth));

	/**
	 * Card grid track. Card-min/gap MUST mirror `gridColumns()` in
	 * `$lib/utils/grid` (140px/8px ≤640px, 200px/20px above) so the windowing
	 * math matches the browser's actual wrapping.
	 */
	const GRID_CLASS =
		'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 min-[641px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] min-[641px]:gap-5';

	// Build the list-view column track from the enabled cells.
	const columns = $derived(
		[
			selectable ? '36px' : '',
			'minmax(200px, 2fr)',
			showOwner ? 'minmax(120px, 1fr)' : '',
			showPath ? 'minmax(140px, 1.5fr)' : '',
			showType ? '120px' : '',
			showSize ? '110px' : '',
			showDate ? '160px' : '',
			actions ? '120px' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const SKELETON = [0, 1, 2, 3, 4, 5];

	/** Coarse file-kind → daisyUI semantic colour for the type-tinted icon tile. */
	const KIND_COLOR: Record<string, string> = {
		folder: 'text-primary',
		pdf: 'text-error',
		doc: 'text-info',
		sheet: 'text-success',
		slides: 'text-warning',
		archive: 'text-base-content/60',
		code: 'text-secondary',
		image: 'text-accent',
		video: 'text-secondary',
		audio: 'text-info',
		text: 'text-info',
		generic: 'text-base-content/60'
	};
	function kindColor(iconName: string): string {
		return KIND_COLOR[fileIconKind(iconName)] ?? KIND_COLOR.generic;
	}

	// Row/cell styling per view mode. List rows: compact flex line on phones,
	// column grid from 641px (mirrors the legacy 640px reflow breakpoint).
	const rowClass = $derived(
		isGrid
			? 'relative flex min-h-40 w-full cursor-pointer flex-col items-center rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg'
			: 'flex cursor-pointer items-center gap-3 border-b border-base-300/40 px-4 py-3 hover:bg-base-200/60 min-[641px]:grid min-[641px]:gap-x-3 min-[641px]:[grid-template-columns:var(--files-list-columns)]'
	);
	/** List-only columns collapse on phones (icon + name … size + actions stay). */
	const cellClass = 'hidden min-w-0 truncate min-[641px]:block';

	// ── Group-by / direction ──────────────────────────────────────────────────
	const activeGroup = $derived(groupBys?.find((g) => g.key === groupBy));

	function selectGroup(key: string) {
		if (groupBy === key) return;
		groupBy = key;
		const def = groupBys?.find((g) => g.key === key);
		onreload?.(def?.orderBy ?? 'name', reversed);
	}

	function toggleDirection() {
		reversed = !reversed;
		onreload?.(activeGroup?.orderBy ?? 'name', reversed);
	}

	/**
	 * Partition the visible items into grouped sections when a `bucketOf` is
	 * active. Server order is preserved within and across buckets (first-seen).
	 */
	const sections = $derived.by((): Array<{ key: string; label: string; rows: ResourceEntry[] }> => {
		const bucketOf = activeGroup?.bucketOf;
		if (!bucketOf) return [{ key: '', label: '', rows: items }];
		const order: string[] = [];
		// Transient bucketing map computed inside $derived.by — not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, ResourceEntry[]>();
		for (const entry of items) {
			const k = bucketOf(entry) ?? '∅';
			if (!map.has(k)) {
				map.set(k, []);
				order.push(k);
			}
			map.get(k)!.push(entry);
		}
		return order.map((k) => ({
			key: k,
			label: activeGroup?.labelOf?.(k) ?? k,
			rows: map.get(k)!
		}));
	});
	const grouped = $derived(!!activeGroup?.bucketOf);

	// ── Selection ─────────────────────────────────────────────────────────────
	// SvelteSet is reactive on its own; mutate in place rather than reassigning.
	const selected = new SvelteSet<string>();

	function toggleSelected(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
		onselectionchange?.(selected);
	}
	function clearSelection() {
		selected.clear();
		onselectionchange?.(selected);
	}
	const allSelected = $derived(items.length > 0 && selected.size === items.length);
	function toggleSelectAll() {
		if (allSelected) clearSelection();
		else {
			selected.clear();
			for (const i of items) selected.add(i.id);
			onselectionchange?.(selected);
		}
	}
	const selectedEntries = $derived(items.filter((i) => selected.has(i.id)));

	// Drop selection ids that are no longer present after a reload.
	$effect(() => {
		const ids = new Set(items.map((i) => i.id));
		let changed = false;
		for (const id of selected) {
			if (!ids.has(id)) {
				selected.delete(id);
				changed = true;
			}
		}
		if (changed) onselectionchange?.(selected);
	});

	// ── Right-click context menu ──────────────────────────────────────────────
	let ctxOpen = $state(false);
	let ctxX = $state(0);
	let ctxY = $state(0);
	let ctxEntry = $state<ResourceEntry | null>(null);

	function openContext(e: MouseEvent, entry: ResourceEntry) {
		if (!contextActions?.length) return;
		e.preventDefault();
		e.stopPropagation();
		ctxEntry = entry;
		ctxX = Math.min(e.clientX, window.innerWidth - 220);
		ctxY = Math.min(e.clientY, window.innerHeight - (contextActions.length * 44 + 24));
		ctxOpen = true;
	}
	function closeContext() {
		ctxOpen = false;
		ctxEntry = null;
	}

	// ── Infinite scroll (IntersectionObserver) ────────────────────────────────
	let sentinel = $state<HTMLElement | null>(null);
	$effect(() => {
		const el = sentinel;
		if (!el || typeof IntersectionObserver === 'undefined') return;
		const obs = new IntersectionObserver(
			(entries) => {
				for (const en of entries) {
					if (en.isIntersecting && hasMore && !loading) onloadmore?.();
				}
			},
			{ rootMargin: '200px' }
		);
		obs.observe(el);
		return () => obs.disconnect();
	});

	function ownerTitle(entry: ResourceEntry): string {
		const owner = entry.ownerName ?? entry.ownerId ?? '';
		const path = entry.path ?? '';
		return [
			owner && `${t('files.col_owner', 'Owner')}: ${owner}`,
			path && `${t('files.col_path', 'Location')}: ${path}`
		]
			.filter(Boolean)
			.join('\n');
	}
</script>

{#snippet row(entry: ResourceEntry)}
	{@const iconName = entry.kind === 'folder' ? 'folder' : iconNameFromClass(entry.iconClass)}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="{rowClass} {selectable && selected.has(entry.id)
			? isGrid
				? 'border-primary bg-primary/10'
				: 'bg-primary/10'
			: ''}"
		role={onopen ? 'button' : undefined}
		tabindex={onopen ? 0 : undefined}
		aria-label={onopen ? entry.name : undefined}
		data-testid={entry.name}
		title={showOwner ? ownerTitle(entry) : undefined}
		onclick={onopen ? () => onopen(entry) : undefined}
		onkeydown={onopen ? (e) => e.key === 'Enter' && onopen(entry) : undefined}
		oncontextmenu={contextActions?.length ? (e) => openContext(e, entry) : undefined}
	>
		{#if selectable}
			<div
				class="flex items-center justify-center {isGrid ? 'absolute top-2 left-2 z-[1]' : ''}"
				role="presentation"
				onclick={(e) => e.stopPropagation()}
			>
				<input
					type="checkbox"
					class="checkbox checkbox-sm checkbox-primary bg-base-100"
					aria-label={t('common.select', 'Select')}
					data-testid={`resource-list-select-${entry.id}-checkbox`}
					checked={selected.has(entry.id)}
					onchange={() => toggleSelected(entry.id)}
				/>
			</div>
		{/if}
		<div
			class={isGrid
				? 'flex w-full min-w-0 flex-1 flex-col items-center gap-2'
				: 'flex min-w-0 flex-1 items-center gap-3 min-[641px]:flex-none'}
		>
			<span
				class="{kindColor(
					iconName
				)} flex shrink-0 items-center justify-center rounded-xl bg-current/10 ring-1 ring-current/20 ring-inset {isGrid
					? 'h-[70px] w-[100px] text-3xl'
					: 'h-10 w-10 text-base'}"
			>
				<Icon name={iconName} />
			</span>
			<span
				class="text-base-content min-w-0 truncate {isGrid
					? 'w-full text-center text-sm font-medium'
					: ''}">{entry.name}</span
			>
		</div>
		{#if !isGrid}
			{#if showOwner}
				<div class="hidden min-w-0 items-center min-[641px]:flex">
					{#if entry.ownerId}
						<UserVignette userId={entry.ownerId} fallbackLabel={entry.ownerName ?? undefined} />
					{:else}
						<span class="text-base-content/60 truncate">{entry.ownerName ?? '—'}</span>
					{/if}
				</div>
			{/if}
			{#if showPath}<div class="{cellClass} text-base-content/70">{entry.path ?? ''}</div>{/if}
			{#if showType}<div class="{cellClass} text-base-content/70">{entry.typeLabel ?? ''}</div>{/if}
			{#if showSize}
				<div class="text-base-content/70 min-w-0 truncate text-right min-[641px]:justify-self-end">
					{entry.size != null ? formatBytes(entry.size) : '—'}
				</div>
			{/if}
			{#if showDate}
				<div class="{cellClass} text-base-content/70">
					{#if dateCell}{@render dateCell(entry)}{:else}{formatDate(entry.date)}{/if}
				</div>
			{/if}
		{:else}
			<div
				class="text-base-content/60 mt-0.5 flex max-w-full items-center justify-center gap-1 text-[11px]"
			>
				{#if showDate && dateCell}
					<span class="absolute top-2 right-2 z-[1]">{@render dateCell(entry)}</span>
				{/if}
				<span class="flex items-center gap-2">
					{#if entry.size != null}<span>{formatBytes(entry.size)}</span>{/if}
					{#if entry.date != null}<span>{formatDate(entry.date)}</span>{/if}
				</span>
			</div>
		{/if}
		{#if onfavorite}
			<button
				class="btn btn-ghost btn-xs btn-square {entry.isFavorite
					? 'text-warning'
					: 'text-base-content/40'} {isGrid
					? 'absolute top-2 ' + (selectable ? 'left-9' : 'left-2')
					: ''}"
				data-testid={`resource-list-favorite-${entry.id}-btn`}
				title={entry.isFavorite
					? t('files.unfavorite', 'Remove favorite')
					: t('files.favorite', 'Add favorite')}
				aria-pressed={!!entry.isFavorite}
				onclick={(e) => {
					e.stopPropagation();
					onfavorite(entry);
				}}><Icon name={entry.isFavorite ? 'star' : 'star-outline'} /></button
			>
		{/if}
		{#if actions}
			<div class="flex items-center gap-1 {isGrid ? 'mt-1 justify-center' : 'justify-end'}">
				{@render actions(entry)}
			</div>
		{/if}
	</div>
{/snippet}

<div class="bg-base-100 sticky -top-5 z-10 py-2.5">
	<h1 class="text-base-content mb-5 text-2xl font-bold">{title}</h1>
	<ListToolbar
		groups={groupBys}
		{groupBy}
		{reversed}
		ongroup={selectGroup}
		ondirection={toggleDirection}
		{showViewToggle}
	>
		{#snippet start()}
			<div class="flex flex-wrap items-center gap-2">{@render toolbar?.()}</div>
		{/snippet}
	</ListToolbar>
</div>

{#if selectable && selected.size > 0 && batchToolbar}
	<div
		class="bg-primary/10 border-base-300 mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2"
		role="region"
		aria-label={t('files.selection', 'Selection')}
		data-testid="resource-list-batch-toolbar"
	>
		<button
			class="btn btn-ghost btn-xs btn-square"
			title={t('common.clear', 'Clear')}
			data-testid="resource-list-batch-close-btn"
			onclick={clearSelection}
		>
			<Icon name="times" />
		</button>
		<span class="text-base-content font-semibold"
			>{t('files.selected_count', { count: selected.size }, '{{count}} selected')}</span
		>
		<div class="ml-auto flex items-center gap-2">{@render batchToolbar(selectedEntries)}</div>
	</div>
{/if}

{#if error}
	<EmptyState icon="exclamation-circle" title={error} error />
{:else if loading && isEmpty}
	<SkeletonList count={SKELETON.length} />
{:else if isEmpty}
	<EmptyState
		icon={emptyIcon}
		title={emptyText ?? t('common.empty', 'Nothing here yet.')}
		hint={emptyHint}
	/>
{:else}
	<div class="relative" bind:clientWidth={gridWidth}>
		{#if grouped}
			<div class={isGrid ? GRID_CLASS : ''} style="--files-list-columns: {columns}">
				{#if !isGrid}{@render listHeader()}{/if}
				{#each sections as section (section.key)}
					<div
						class="border-base-300/60 text-base-content/70 col-span-full flex items-center justify-between gap-2 border-b px-1 pt-3 pb-1 text-sm font-semibold"
						role="rowheader"
					>
						<span>{section.label}</span>
						{#if bucketAction}
							<span class="inline-flex items-center">
								{@render bucketAction(section.key)}
							</span>
						{/if}
					</div>
					{#if !isGrid}
						<!-- Window each section's rows so a large grouped list (e.g. a big
						     trash, grouped by remaining days) doesn't mount every row. The
						     grid-grouped branch stays un-windowed: the card grid itself hosts
						     the swimlane headers and can't fit the windowing spacer wrapper. -->
						<VirtualList items={section.rows} rowHeight={56} key={(e) => e.id} {row} />
					{:else}
						{#each section.rows as entry (entry.id)}
							{@render row(entry)}
						{/each}
					{/if}
				{/each}
			</div>
		{:else if !isGrid}
			<!-- Flat list view: only the visible rows are mounted. The spacer keeps the
			     full scroll height so the end-of-list sentinel still fires. -->
			<div style="--files-list-columns: {columns}">
				{@render listHeader()}
				<VirtualList {items} rowHeight={56} key={(e) => e.id} {row} />
			</div>
		{:else}
			<!-- Grid view: the windowed list's inner element IS the card grid. -->
			<VirtualList
				{items}
				columns={gridCols}
				rowHeight={240}
				windowClass={GRID_CLASS}
				key={(e) => e.id}
				{row}
			/>
		{/if}

		{#if hasMore}
			<button
				class="btn btn-sm mx-auto mt-4 flex"
				data-testid="resource-list-load-more-btn"
				onclick={onloadmore}
				disabled={loading}
			>
				{loading ? t('common.loading', 'Loading…') : t('common.load_more', 'Load more')}
			</button>
		{/if}
		<!-- Infinite-scroll sentinel: auto-loads the next page as it nears the viewport. -->
		<div bind:this={sentinel} class="h-px w-full" aria-hidden="true"></div>
	</div>
{/if}

{#snippet listHeader()}
	<!-- Phones collapse rows to a flex line, so the column header only appears
	     from 641px — except in selectable mode, where it keeps hosting the
	     select-all checkbox (non-name cells are hidden by their own classes). -->
	<div
		class="{selectable
			? 'flex'
			: 'hidden'} bg-base-200 border-base-300 text-base-content items-center gap-3 border-b px-4 py-3.5 text-sm font-semibold min-[641px]:grid min-[641px]:gap-x-3 min-[641px]:[grid-template-columns:var(--files-list-columns)]"
	>
		{#if selectable}
			<div class="flex items-center justify-center">
				<input
					type="checkbox"
					class="checkbox checkbox-sm checkbox-primary"
					aria-label={t('common.select_all', 'Select all')}
					data-testid="resource-list-select-all-checkbox"
					checked={allSelected}
					onchange={toggleSelectAll}
				/>
			</div>
		{/if}
		<div class="min-w-0 truncate">{t('files.col_name', 'Name')}</div>
		{#if showOwner}<div class={cellClass}>{t('files.col_owner', 'Owner')}</div>{/if}
		{#if showPath}<div class={cellClass}>{pathLabel ?? t('files.col_path', 'Location')}</div>{/if}
		{#if showType}<div class={cellClass}>{t('files.col_type', 'Type')}</div>{/if}
		{#if showSize}
			<div class="{cellClass} text-right min-[641px]:justify-self-end">
				{t('files.col_size', 'Size')}
			</div>
		{/if}
		{#if showDate}<div class={cellClass}>{dateLabel ?? t('files.col_modified', 'Date')}</div>{/if}
		{#if onfavorite || actions}<div></div>{/if}
	</div>
{/snippet}

{#if ctxOpen && ctxEntry && contextActions}
	<div
		class="fixed inset-0 z-40"
		role="presentation"
		onclick={closeContext}
		oncontextmenu={(e) => e.preventDefault()}
	></div>
	<div
		class="bg-base-100 border-base-300 rounded-box fixed z-50 flex min-w-[200px] flex-col p-1 shadow-lg"
		style:left="{ctxX}px"
		style:top="{ctxY}px"
		role="menu"
		data-testid="resource-list-context-menu"
	>
		{#each contextActions as action (action.key)}
			<button
				class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left {action.danger
					? 'text-error'
					: 'text-base-content'}"
				role="menuitem"
				data-testid={`resource-list-context-${action.key}-item`}
				onclick={() => {
					const e = ctxEntry!;
					closeContext();
					action.run(e);
				}}
			>
				<Icon name={action.icon} />
				{action.label}
			</button>
		{/each}
	</div>
{/if}
