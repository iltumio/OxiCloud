<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import VirtualList from '$lib/components/VirtualList.svelte';
	import { errorMessage } from '$lib/utils/errors';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { searchFiles } from '$lib/api/endpoints/search';
	import { fileInlineUrl } from '$lib/api/endpoints/files';
	import type { FileItem, FolderItem, SearchResults, SortBy } from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { files as filesStore } from '$lib/stores/files.svelte';
	import { formatBytes } from '$lib/utils/format';
	import { formatDate, iconNameFromClass } from '$lib/utils/display';

	const query = $derived(page.url.searchParams.get('q') ?? '');

	let sortBy = $state<SortBy>('relevance');
	// Scope: search everywhere, or within the folder last open in the files view.
	// Default to the current folder when one is set (and we're not in the trash
	// section), mirroring the legacy searchView behaviour.
	let scope = $state<'all' | 'folder'>(
		filesStore.currentFolder && filesStore.section !== 'trash' ? 'folder' : 'all'
	);

	// Filters
	type TypeKey = 'all' | 'image' | 'video' | 'document' | 'audio' | 'archive';
	type SizeKey = 'all' | 'small' | 'medium' | 'large';
	type DateKey = 'all' | 'day' | 'week' | 'month' | 'year';
	let typeFilter = $state<TypeKey>('all');
	let sizeFilter = $state<SizeKey>('all');
	let dateFilter = $state<DateKey>('all');

	const TYPE_EXT: Record<Exclude<TypeKey, 'all'>, string[]> = {
		image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'avif', 'tiff'],
		video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv'],
		document: [
			'pdf',
			'doc',
			'docx',
			'xls',
			'xlsx',
			'ppt',
			'pptx',
			'txt',
			'md',
			'odt',
			'rtf',
			'csv'
		],
		audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus'],
		archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']
	};
	const TYPES: { v: TypeKey; l: string }[] = [
		{ v: 'all', l: t('search.type.all', 'All types') },
		{ v: 'image', l: t('search.type.image', 'Images') },
		{ v: 'video', l: t('search.type.video', 'Videos') },
		{ v: 'document', l: t('search.type.document', 'Documents') },
		{ v: 'audio', l: t('search.type.audio', 'Audio') },
		{ v: 'archive', l: t('search.type.archive', 'Archives') }
	];
	const SIZES: { v: SizeKey; l: string }[] = [
		{ v: 'all', l: t('search.size.all', 'Any size') },
		{ v: 'small', l: t('search.size.small', '< 1 MB') },
		{ v: 'medium', l: t('search.size.medium', '1–100 MB') },
		{ v: 'large', l: t('search.size.large', '> 100 MB') }
	];
	const DATES: { v: DateKey; l: string }[] = [
		{ v: 'all', l: t('search.date.all', 'Any time') },
		{ v: 'day', l: t('search.date.day', 'Past 24 hours') },
		{ v: 'week', l: t('search.date.week', 'Past week') },
		{ v: 'month', l: t('search.date.month', 'Past month') },
		{ v: 'year', l: t('search.date.year', 'Past year') }
	];

	const MB = 1024 * 1024;
	function sizeBounds(k: SizeKey): { minSize?: number; maxSize?: number } {
		switch (k) {
			case 'small':
				return { maxSize: MB };
			case 'medium':
				return { minSize: MB, maxSize: 100 * MB };
			case 'large':
				return { minSize: 100 * MB };
			default:
				return {};
		}
	}
	function dateBound(k: DateKey): number | undefined {
		const day = 86400;
		const now = Math.floor(Date.now() / 1000);
		switch (k) {
			case 'day':
				return now - day;
			case 'week':
				return now - 7 * day;
			case 'month':
				return now - 30 * day;
			case 'year':
				return now - 365 * day;
			default:
				return undefined;
		}
	}

	const hasFilters = $derived(typeFilter !== 'all' || sizeFilter !== 'all' || dateFilter !== 'all');
	function clearFilters() {
		typeFilter = 'all';
		sizeFilter = 'all';
		dateFilter = 'all';
	}

	const SORTS: { v: SortBy; l: string }[] = [
		{ v: 'relevance', l: t('search.sort.relevance', 'Relevance') },
		{ v: 'name', l: t('search.sort.name_asc', 'Name A-Z') },
		{ v: 'name_desc', l: t('search.sort.name_desc', 'Name Z-A') },
		{ v: 'date_desc', l: t('search.sort.newest', 'Newest') },
		{ v: 'date', l: t('search.sort.oldest', 'Oldest') },
		{ v: 'size_desc', l: t('search.sort.largest', 'Largest') },
		{ v: 'size', l: t('search.sort.smallest', 'Smallest') }
	];

	// Trash section searches are always global — there is no folder to scope to.
	const scopedFolderId = $derived(
		scope === 'folder' && filesStore.section !== 'trash'
			? (filesStore.currentFolder ?? undefined)
			: undefined
	);

	// One query per (q, sort, scope, filters) combination: changing any control
	// re-keys the query and re-runs the search (replacing the old `$effect`).
	const searchQuery = createQuery(() => ({
		queryKey: [
			'search',
			query,
			sortBy,
			scopedFolderId ?? null,
			typeFilter,
			sizeFilter,
			dateFilter
		] as const,
		queryFn: () =>
			searchFiles(query, {
				recursive: true,
				sortBy,
				folderId: scopedFolderId,
				fileTypes: typeFilter === 'all' ? undefined : TYPE_EXT[typeFilter],
				...sizeBounds(sizeFilter),
				modifiedAfter: dateBound(dateFilter)
			}),
		enabled: !!query,
		// The legacy page never retried a failed search; keep that behaviour.
		retry: false
	}));

	const results = $derived<SearchResults | null>(query ? (searchQuery.data ?? null) : null);
	const loading = $derived(!!query && searchQuery.isFetching);
	const error = $derived(searchQuery.isError ? errorMessage(searchQuery.error) : null);

	function openFolder(folder: FolderItem) {
		goto(resolve(`/files/${folder.id}`));
	}

	function openFile(file: FileItem) {
		window.open(fileInlineUrl(file.id), '_blank', 'noopener');
	}

	const isEmpty = $derived(!!results && results.files.length === 0 && results.folders.length === 0);

	// Flatten folders + files into one list so the results render through a single
	// windowed list (only the visible rows hit the DOM, even for 100s of hits).
	type SearchEntry = { kind: 'folder'; folder: FolderItem } | { kind: 'file'; file: FileItem };
	const entries = $derived<SearchEntry[]>(
		results
			? [
					...results.folders.map((folder) => ({ kind: 'folder' as const, folder })),
					...results.files.map((file) => ({ kind: 'file' as const, file }))
				]
			: []
	);

	// Row/header grids mirror ResourceList's list view so search results read as
	// the same table. Non-name columns collapse on phones (<641px).
	const ROW_CLASS =
		'flex cursor-pointer items-center gap-3 border-b border-base-300/40 px-4 py-3 hover:bg-base-200/60 min-[641px]:grid min-[641px]:gap-x-3 min-[641px]:[grid-template-columns:var(--files-list-columns)]';
	const CELL_CLASS = 'hidden min-w-0 truncate text-base-content/70 min-[641px]:block';
</script>

<svelte:head><title>{t('search.title', 'Search')} · OxiCloud</title></svelte:head>

<div
	class="bg-base-100 sticky -top-5 z-10 flex flex-wrap items-center justify-between gap-3 py-2.5"
>
	<h1 class="text-base-content m-0 text-2xl font-bold">
		{#if query}{t('search.results_for', { q: query }, 'Results for “{{q}}”')}{:else}{t(
				'search.title',
				'Search'
			)}{/if}
		{#if results?.query_time_ms != null}
			<span class="text-base-content/60 text-sm font-normal">({results.query_time_ms} ms)</span>
		{/if}
	</h1>
	{#if query}
		<div class="flex flex-wrap items-center gap-2">
			{#if filesStore.currentFolder}
				<div class="join" role="group" aria-label={t('search.scope', 'Scope')}>
					<button
						class="btn btn-sm join-item {scope === 'all' ? 'btn-primary' : ''}"
						data-testid="search-scope-all-btn"
						onclick={() => (scope = 'all')}
					>
						{t('search.everywhere', 'Everywhere')}
					</button>
					<button
						class="btn btn-sm join-item {scope === 'folder' ? 'btn-primary' : ''}"
						data-testid="search-scope-folder-btn"
						onclick={() => (scope = 'folder')}
					>
						{t('search.this_folder', 'This folder')}
					</button>
				</div>
			{/if}
			<select
				class="select select-sm w-auto"
				bind:value={typeFilter}
				aria-label={t('search.type_label', 'Type')}
				data-testid="search-type-filter-select"
			>
				{#each TYPES as o (o.v)}<option value={o.v} data-testid={`search-type-${o.v}`}>{o.l}</option
					>{/each}
			</select>
			<select
				class="select select-sm w-auto"
				bind:value={sizeFilter}
				aria-label={t('search.size_label', 'Size')}
				data-testid="search-size-filter-select"
			>
				{#each SIZES as o (o.v)}<option value={o.v} data-testid={`search-size-${o.v}`}>{o.l}</option
					>{/each}
			</select>
			<select
				class="select select-sm w-auto"
				bind:value={dateFilter}
				aria-label={t('search.date_label', 'Date')}
				data-testid="search-date-filter-select"
			>
				{#each DATES as o (o.v)}<option value={o.v} data-testid={`search-date-${o.v}`}>{o.l}</option
					>{/each}
			</select>
			<select
				class="select select-sm w-auto"
				bind:value={sortBy}
				aria-label={t('search.sort_by', 'Sort by')}
				data-testid="search-sort-select"
			>
				{#each SORTS as s (s.v)}<option value={s.v} data-testid={`search-sort-${s.v}`}>{s.l}</option
					>{/each}
			</select>
			{#if hasFilters}
				<button
					class="btn btn-sm btn-ghost gap-1.5"
					data-testid="search-clear-filters-btn"
					onclick={clearFilters}
				>
					<Icon name="times" />
					{t('search.clear_filters', 'Clear filters')}
				</button>
			{/if}
		</div>
	{/if}
</div>

{#if loading}
	<div class="text-base-content/60 flex items-center gap-3 py-4">
		<span class="loading loading-spinner text-primary"></span>
		<h2 class="text-base-content m-0 text-lg font-medium">
			{t('search.searching_for', { q: query }, 'Searching for “{{q}}”…')}
		</h2>
	</div>
{:else if error}
	<EmptyState title={error} error />
{:else if !query}
	<EmptyState title={t('search.prompt', 'Type a query in the search bar above.')} />
{:else if isEmpty}
	<EmptyState icon="search" title={t('search.no_results', 'No results found for this search')} />
{:else if results}
	<div style="--files-list-columns: minmax(200px, 2fr) 1fr 110px 140px">
		<div
			class="bg-base-200 border-base-300 text-base-content hidden items-center gap-3 border-b px-4 py-3.5 text-sm font-semibold min-[641px]:grid min-[641px]:gap-x-3 min-[641px]:[grid-template-columns:var(--files-list-columns)]"
		>
			<div>{t('files.col_name', 'Name')}</div>
			<div>{t('files.col_path', 'Path')}</div>
			<div>{t('files.col_size', 'Size')}</div>
			<div>{t('files.col_modified', 'Modified')}</div>
		</div>

		<VirtualList
			items={entries}
			rowHeight={56}
			key={(e) => (e.kind === 'folder' ? e.folder.id : e.file.id)}
		>
			{#snippet row(e)}
				{#if e.kind === 'folder'}
					<div
						class={ROW_CLASS}
						role="button"
						tabindex="0"
						aria-label={e.folder.name}
						data-testid={e.folder.name}
						onclick={() => openFolder(e.folder)}
						onkeydown={(ev) => ev.key === 'Enter' && openFolder(e.folder)}
					>
						<div class="flex min-w-0 flex-1 items-center gap-3 min-[641px]:flex-none">
							<span
								class="text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-current/10 ring-1 ring-current/20 ring-inset"
								><Icon name="folder" /></span
							>
							<span class="text-base-content min-w-0 truncate">{e.folder.name}</span>
						</div>
						<div class={CELL_CLASS}>{e.folder.path}</div>
						<div class={CELL_CLASS}>—</div>
						<div class={CELL_CLASS}>{formatDate(e.folder.modified_at)}</div>
					</div>
				{:else}
					<div
						class={ROW_CLASS}
						role="button"
						tabindex="0"
						aria-label={e.file.name}
						data-testid={e.file.name}
						onclick={() => openFile(e.file)}
						onkeydown={(ev) => ev.key === 'Enter' && openFile(e.file)}
					>
						<div class="flex min-w-0 flex-1 items-center gap-3 min-[641px]:flex-none">
							<span
								class="text-base-content/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-current/10 ring-1 ring-current/20 ring-inset"
								><Icon name={iconNameFromClass(e.file.icon_class)} /></span
							>
							<span class="text-base-content min-w-0 truncate">{e.file.name}</span>
						</div>
						<div class={CELL_CLASS}>{e.file.path}</div>
						<div class={CELL_CLASS}>{e.file.size != null ? formatBytes(e.file.size) : ''}</div>
						<div class={CELL_CLASS}>{formatDate(e.file.modified_at)}</div>
					</div>
				{/if}
			{/snippet}
		</VirtualList>
	</div>
{/if}
