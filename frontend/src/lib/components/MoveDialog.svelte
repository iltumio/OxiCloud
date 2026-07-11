<script lang="ts">
	import { errorToast } from '$lib/utils/errors';
	import { listFolder, moveFolder } from '$lib/api/endpoints/folders';
	import { moveFile } from '$lib/api/endpoints/files';
	import { copyFiles, copyFolders } from '$lib/api/endpoints/batch';
	import type { Drive, DriveRole, FolderItem } from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { drives as drivesStore, driveIcon } from '$lib/stores/drives.svelte';
	import { ui } from '$lib/stores/ui.svelte';

	// A drive accepts new items only if the caller can Create on its root.
	// Owner / Editor / Contributor cover that; Commenter + Viewer cannot.
	const WRITABLE_ROLES: readonly DriveRole[] = ['owner', 'editor', 'contributor'] as const;
	function isWritable(d: Drive): boolean {
		return d.caller_role != null && WRITABLE_ROLES.includes(d.caller_role);
	}

	// Default-personal first, then secondary personals, then shared; within
	// a group, alphabetical. Mirrors DrivePicker so the sidebar and this
	// dialog rank drives identically.
	function driveRank(d: Drive): number {
		if (d.default_for_user) return 0;
		return d.kind === 'personal' ? 1 : 2;
	}

	interface Target {
		id: string;
		name: string;
		kind: 'file' | 'folder';
	}

	interface Props {
		open: boolean;
		item: Target | null;
		/** Optional multi-item batch; takes precedence over `item`. */
		items?: Target[] | null;
		/** 'move' (default) relocates; 'copy' duplicates into the picked folder. */
		mode?: 'move' | 'copy';
		onmoved?: () => void;
	}

	let { open = $bindable(false), item, items = null, mode = 'move', onmoved }: Props = $props();

	const targets = $derived(items && items.length ? items : item ? [item] : []);
	const targetIds = $derived(new Set(targets.map((x) => x.id)));

	let crumbs = $state<Array<{ id: string; name: string }>>([]);
	let folders = $state<FolderItem[]>([]);
	let currentId = $state<string | null>(null);
	let selectedDriveId = $state<string | null>(null);
	let loading = $state(false);
	let working = $state(false);

	const writableDrives = $derived(
		drivesStore.drives.filter(isWritable).toSorted((a, b) => {
			const r = driveRank(a) - driveRank(b);
			return r !== 0 ? r : a.name.localeCompare(b.name);
		})
	);

	// The chip strip only earns its vertical space when there's a real
	// choice. One writable drive → identical to the single-drive UI.
	const showDriveSwitcher = $derived(writableDrives.length > 1);

	async function loadInto(id: string) {
		loading = true;
		try {
			currentId = id;
			folders = (await listFolder(id)).folders;
		} catch (e) {
			errorToast(e);
		} finally {
			loading = false;
		}
	}

	async function init() {
		await drivesStore.load();
		const home = drivesStore.findDefault();
		// Prefer the user's home drive when it's writable (covers the
		// common case: moving stuff around inside Personal). Otherwise
		// fall back to the first writable drive, sorted as above.
		const start = home && isWritable(home) ? home : writableDrives[0];
		if (!start) return;
		selectedDriveId = start.id;
		crumbs = [{ id: start.root_folder_id, name: start.name }];
		await loadInto(start.root_folder_id);
	}

	async function switchDrive(d: Drive) {
		if (d.id === selectedDriveId) return;
		selectedDriveId = d.id;
		crumbs = [{ id: d.root_folder_id, name: d.name }];
		await loadInto(d.root_folder_id);
	}

	function enter(f: FolderItem) {
		crumbs = [...crumbs, { id: f.id, name: f.name }];
		void loadInto(f.id);
	}

	function gotoCrumb(index: number) {
		crumbs = crumbs.slice(0, index + 1);
		void loadInto(crumbs[index].id);
	}

	/** Jump to the home (root) folder — the first crumb. */
	function goHome() {
		if (crumbs.length) gotoCrumb(0);
	}

	/** Step up one level to the parent folder (no-op at home). */
	function goParent() {
		if (crumbs.length > 1) gotoCrumb(crumbs.length - 2);
	}

	const atHome = $derived(crumbs.length <= 1);

	async function confirmMove() {
		if (!targets.length || !currentId) return;
		working = true;
		try {
			if (mode === 'copy') {
				const fileIds = targets.filter((x) => x.kind === 'file').map((x) => x.id);
				const folderIds = targets.filter((x) => x.kind === 'folder').map((x) => x.id);
				await copyFiles(fileIds, currentId);
				await copyFolders(folderIds, currentId);
				ui.notify(t('files.copied', 'Copied'), 'success');
			} else {
				for (const tgt of targets) {
					if (tgt.id === currentId) continue;
					if (tgt.kind === 'file') await moveFile(tgt.id, currentId);
					else await moveFolder(tgt.id, currentId);
				}
				ui.notify(t('files.moved', 'Moved'), 'success');
			}
			open = false;
			onmoved?.();
		} catch (e) {
			errorToast(e);
		} finally {
			working = false;
		}
	}

	// (Re)initialise the picker each time it opens.
	$effect(() => {
		if (open && targets.length) void init();
	});

	const moveTitle = $derived.by(() => {
		if (mode === 'copy') {
			return targets.length > 1
				? t('files.copy_n', { n: targets.length }, 'Copy {{n}} items')
				: t('files.copy_title', { name: targets[0]?.name ?? '' }, 'Copy “{{name}}”');
		}
		return targets.length > 1
			? t('files.move_n', { n: targets.length }, 'Move {{n}} items')
			: t('files.move_title', { name: targets[0]?.name ?? '' }, 'Move “{{name}}”');
	});
</script>

<Modal bind:open title={moveTitle}>
	<div data-testid="move-dialog">
		{#if showDriveSwitcher}
			<div
				class="border-base-300 mb-3 flex flex-wrap gap-1.5 border-b pb-3"
				role="tablist"
				aria-label={t('drive.picker', 'Drives')}
				data-testid="move-dialog-drives"
			>
				{#each writableDrives as d (d.id)}
					<button
						type="button"
						role="tab"
						aria-selected={d.id === selectedDriveId}
						class="btn btn-sm max-w-56 gap-1.5 normal-case {d.id === selectedDriveId
							? 'btn-primary cursor-default'
							: 'btn-ghost border-base-300 border'}"
						data-testid={`move-dialog-drive-${d.id}`}
						onclick={() => switchDrive(d)}
					>
						<Icon name={driveIcon(d)} />
						<span class="truncate">{d.name}</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="mb-3 flex items-center gap-1">
			<button
				class="btn btn-sm btn-square btn-ghost border-base-300 border"
				data-testid="move-dialog-home-btn"
				title={t('breadcrumb.home', 'Home')}
				aria-label={t('breadcrumb.home', 'Home')}
				disabled={atHome}
				onclick={goHome}><Icon name="home" /></button
			>
			<button
				class="btn btn-sm btn-square btn-ghost border-base-300 border"
				data-testid="move-dialog-parent-btn"
				title={t('dialogs.go_to_parent', 'Go to parent')}
				aria-label={t('dialogs.go_to_parent', 'Go to parent')}
				disabled={atHome}
				onclick={goParent}><Icon name="level-up-alt" /></button
			>
			<nav class="flex min-w-0 flex-wrap items-center gap-1" aria-label="Breadcrumb">
				{#each crumbs as c, i (c.id)}
					{#if i > 0}<span class="text-base-content/50">/</span>{/if}
					<button
						class="link link-hover text-primary rounded px-1 py-0.5"
						data-testid={`move-dialog-crumb-${c.id}`}
						onclick={() => gotoCrumb(i)}>{c.name}</button
					>
				{/each}
			</nav>
		</div>

		{#if loading}
			<p class="text-base-content/60 py-4 text-center">{t('common.loading', 'Loading…')}</p>
		{:else if folders.length === 0}
			<p class="text-base-content/60 py-4 text-center">
				{t('files.no_subfolders', 'No subfolders here.')}
			</p>
		{:else}
			<ul class="m-0 max-h-[50vh] list-none overflow-auto p-0">
				{#each folders as f (f.id)}
					<li>
						<button
							class="hover:bg-base-200 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
							data-testid={`move-dialog-folder-${f.id}`}
							disabled={targetIds.has(f.id)}
							onclick={() => enter(f)}
						>
							<Icon name="folder" class="text-primary" />
							<span class="min-w-0 flex-1 truncate">{f.name}</span>
							<Icon name="chevron-right" class="text-base-content/50" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn" data-testid="move-dialog-cancel-btn" onclick={() => (open = false)}>
			{t('common.cancel', 'Cancel')}
		</button>
		<button
			class="btn btn-primary"
			data-testid="move-dialog-confirm-btn"
			disabled={working || !currentId}
			onclick={confirmMove}
		>
			{mode === 'copy' ? t('files.copy_here', 'Copy here') : t('files.move_here', 'Move here')}
		</button>
	{/snippet}
</Modal>
