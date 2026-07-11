<script lang="ts">
	/**
	 * Full-screen photo/video lightbox, shared by the Photos timeline, People and
	 * Places views. Driven by an `items` list and a bindable `index` (-1 = closed);
	 * deletions are reported via `onDelete` so the parent can update its own list.
	 */
	import Icon from '$lib/icons/Icon.svelte';
	import { addFavorite } from '$lib/api/endpoints/favorites';
	import {
		deleteFile,
		fileDownloadUrl,
		fileInlineUrl,
		fileThumbnailUrl
	} from '$lib/api/endpoints/files';
	import { fetchFileMetadata, type FileMetadata } from '$lib/api/endpoints/photos';
	import type { FileItem } from '$lib/api/types';
	import { confirmDialog } from '$lib/stores/dialogs.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { errorToast } from '$lib/utils/errors';
	import { isVideo, photoTimestamp } from '$lib/utils/media';

	interface Props {
		items: FileItem[];
		/** Current index into `items`; -1 means closed. */
		index: number;
		/** Called after a successful delete so the parent can drop it from `items`. */
		onDelete?: (id: string) => void;
	}

	let { items, index = $bindable(), onDelete }: Props = $props();

	let showingOriginal = $state(false);
	let fullResBusy = $state(false);
	let meta = $state('');
	let favorited = $state(false);
	/** Token guarding against stale async loads during rapid prev/next. */
	let generation = 0;

	const item = $derived(index >= 0 ? (items[index] ?? null) : null);

	// Clamp the index when the list shrinks under us (e.g. after a delete): drop
	// to the last item, or close when nothing is left.
	$effect(() => {
		if (index < 0) return;
		if (items.length === 0) index = -1;
		else if (index >= items.length) index = items.length - 1;
	});

	function baseMeta(p: FileItem): string {
		const dateStr = new Date(photoTimestamp(p)).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
		return p.size_formatted ? `${dateStr} · ${p.size_formatted}` : dateStr;
	}

	function applyMetadata(p: FileItem, md: FileMetadata) {
		const parts = [baseMeta(p)];
		if (md.camera_make || md.camera_model) {
			parts.push([md.camera_make, md.camera_model].filter(Boolean).join(' '));
		}
		if (md.width && md.height) parts.push(`${md.width}×${md.height}`);
		meta = parts.join(' · ');
	}

	/** Reset per-item state and kick off metadata + neighbour preload. */
	function showItem(p: FileItem) {
		const gen = ++generation;
		showingOriginal = p.mime_type === 'image/gif';
		fullResBusy = false;
		favorited = false;
		meta = baseMeta(p);
		preloadNeighbors();
		void fetchFileMetadata(p.id).then((md) => {
			if (md && gen === generation) applyMetadata(p, md);
		});
	}

	// Re-run per-item setup whenever the visible item changes.
	$effect(() => {
		if (item) showItem(item);
	});

	function preloadNeighbors() {
		for (const i of [index - 1, index + 1]) {
			const it = items[i];
			if (it && !isVideo(it)) {
				const pre = new Image();
				pre.src = fileThumbnailUrl(it.id, 'large');
			}
		}
	}

	/** The image src to display: large thumbnail first, original on expand/GIF. */
	const imgSrc = $derived(
		item ? (showingOriginal ? fileInlineUrl(item.id) : fileThumbnailUrl(item.id, 'large')) : ''
	);

	function onImgError() {
		if (!item) return;
		// Thumbnail missing → fall back to the original; original failing is terminal.
		if (!showingOriginal) showingOriginal = true;
	}

	function onImgLoad() {
		fullResBusy = false;
	}

	function expandFullRes() {
		if (!item || showingOriginal) return;
		showingOriginal = true;
		fullResBusy = true;
	}

	function download() {
		if (!item) return;
		const a = document.createElement('a');
		a.href = fileDownloadUrl(item.id);
		a.download = item.name;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	async function toggleFavorite() {
		if (!item) return;
		try {
			await addFavorite('file', item.id);
			favorited = !favorited;
		} catch (e) {
			errorToast(e);
		}
	}

	async function remove() {
		if (!item) return;
		const target = item;
		const ok = await confirmDialog({
			title: t('photos.delete', 'Delete photo'),
			message: t('photos.confirm_delete_one', { name: target.name }, 'Delete {{name}}?'),
			confirmText: t('common.delete', 'Delete'),
			danger: true
		});
		if (!ok) return;
		try {
			await deleteFile(target.id);
			onDelete?.(target.id);
		} catch (e) {
			errorToast(e);
		}
	}

	function prev() {
		if (index > 0) index -= 1;
	}
	function next() {
		if (index >= 0 && index < items.length - 1) index += 1;
	}
	function close() {
		index = -1;
	}
	function onKeydown(e: KeyboardEvent) {
		if (index < 0) return;
		if (e.key === 'Escape') close();
		else if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if item}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[1000] flex items-center justify-center bg-neutral/90"
		role="dialog"
		aria-modal="true"
		aria-label={item.name}
		tabindex="-1"
		data-testid="photo-lightbox"
		onclick={(e) => e.target === e.currentTarget && close()}
	>
		<div class="absolute left-4 top-4 max-w-[60vw] text-neutral-content">
			<div class="truncate font-medium">{item.name}</div>
			<div class="text-sm opacity-80">{meta}</div>
		</div>

		<button
			class="btn btn-circle btn-ghost absolute right-4 top-4 text-2xl text-neutral-content hover:bg-neutral-content/10"
			aria-label={t('common.close', 'Close')}
			data-testid="photo-lightbox-close-btn"
			onclick={close}>×</button
		>

		<button
			class="btn btn-circle btn-ghost absolute left-2 top-1/2 -translate-y-1/2 text-2xl text-neutral-content hover:bg-neutral-content/10 disabled:bg-transparent disabled:text-neutral-content/30"
			aria-label={t('common.previous', 'Previous')}
			disabled={index === 0}
			data-testid="photo-lightbox-prev-btn"
			onclick={(e) => {
				e.stopPropagation();
				prev();
			}}><Icon name="chevron-left" /></button
		>

		<div class="flex max-h-[88vh] max-w-[92vw] items-center justify-center">
			{#if isVideo(item)}
				{#key item.id}
					<video
						class="max-h-[88vh] max-w-[92vw] object-contain"
						controls
						autoplay
						poster={fileThumbnailUrl(item.id, 'large')}
					>
						<source src={fileInlineUrl(item.id)} type={item.mime_type} />
					</video>
				{/key}
			{:else}
				<img
					class="max-h-[88vh] max-w-[92vw] object-contain"
					src={imgSrc}
					alt={item.name}
					onload={onImgLoad}
					onerror={onImgError}
				/>
			{/if}
		</div>

		<button
			class="btn btn-circle btn-ghost absolute right-2 top-1/2 -translate-y-1/2 text-2xl text-neutral-content hover:bg-neutral-content/10 disabled:bg-transparent disabled:text-neutral-content/30"
			aria-label={t('common.next', 'Next')}
			disabled={index === items.length - 1}
			data-testid="photo-lightbox-next-btn"
			onclick={(e) => {
				e.stopPropagation();
				next();
			}}><Icon name="chevron-right" /></button
		>

		<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
			{#if !isVideo(item) && item.mime_type !== 'image/gif' && !showingOriginal}
				<button
					class="btn btn-circle border-none bg-neutral/60 text-neutral-content hover:bg-neutral/80 disabled:bg-neutral/40 disabled:text-neutral-content/50"
					title={t('photos.full_resolution', 'Full resolution')}
					disabled={fullResBusy}
					onclick={expandFullRes}><Icon name={fullResBusy ? 'spinner' : 'expand'} /></button
				>
			{/if}
			<button
				class="btn btn-circle border-none bg-neutral/60 text-neutral-content hover:bg-neutral/80"
				title={t('common.download', 'Download')}
				onclick={download}
			>
				<Icon name="download" />
			</button>
			<button
				class="btn btn-circle border-none bg-neutral/60 hover:bg-neutral/80 {favorited
					? 'text-primary'
					: 'text-neutral-content'}"
				title={t('common.favorite', 'Favorite')}
				onclick={toggleFavorite}><Icon name={favorited ? 'star' : 'star-outline'} /></button
			>
			<button
				class="btn btn-circle border-none bg-neutral/60 text-neutral-content hover:bg-neutral/80"
				title={t('common.delete', 'Delete')}
				onclick={remove}
			>
				<Icon name="trash" />
			</button>
		</div>

		<div class="absolute bottom-4 right-4 text-sm text-neutral-content opacity-80">
			{index + 1} / {items.length}
		</div>
	</div>
{/if}
