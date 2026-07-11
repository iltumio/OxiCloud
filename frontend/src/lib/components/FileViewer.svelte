<script lang="ts">
	import { apiFetch } from '$lib/api/client';
	import { fileDownloadUrl, fileInlineUrl } from '$lib/api/endpoints/files';
	import { canEditWithWopi } from '$lib/api/endpoints/wopi';
	import type { FileItem } from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import WopiEditor from '$lib/components/WopiEditor.svelte';
	import { t } from '$lib/i18n/index.svelte';

	interface Props {
		open: boolean;
		file: FileItem | null;
		/** Emitted when the viewer (or its embedded editor) closes, so the
		 *  consumer can refresh the file list to pick up saves. */
		onrefresh?: () => void;
	}

	let { open = $bindable(false), file, onrefresh }: Props = $props();

	type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

	const IMAGE_EXTS = [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'svg',
		'webp',
		'bmp',
		'ico',
		'heic',
		'heif',
		'avif',
		'tiff'
	];

	let textContent = $state('');
	let textLoading = $state(false);
	let wopiOpen = $state(false);
	let canEdit = $state(false);
	/** Image zoom factor (1 = fit). */
	let zoom = $state(1);
	/** Object URL for the fetched PDF blob. The PDF is rendered from a same-origin
	 *  blob: in an <iframe> (allowed by CSP `frame-src blob:`) rather than from its
	 *  API URL directly — that response carries the global `X-Frame-Options: DENY`
	 *  + `frame-ancestors 'none'`, which the browser's framed PDF viewer honours,
	 *  so an embedded API URL renders as a broken-document icon. A blob has no
	 *  response headers, so it sidesteps the framing block. */
	let pdfUrl = $state<string | null>(null);
	let pdfError = $state(false);

	function isImage(f: FileItem): boolean {
		const m = (f.mime_type ?? '').toLowerCase();
		const ext = (f.name || '').split('.').pop()?.toLowerCase() ?? '';
		return m.startsWith('image/') || IMAGE_EXTS.includes(ext);
	}

	function kindOf(f: FileItem): Kind {
		const m = (f.mime_type ?? '').toLowerCase();
		if (isImage(f)) return 'image';
		if (m.startsWith('video/')) return 'video';
		if (m.startsWith('audio/')) return 'audio';
		if (m === 'application/pdf') return 'pdf';
		if (
			m.startsWith('text/') ||
			m === 'application/json' ||
			m === 'application/xml' ||
			m === 'application/javascript'
		)
			return 'text';
		return 'other';
	}

	const kind = $derived(file ? kindOf(file) : 'other');

	function close() {
		open = false;
		textContent = '';
		zoom = 1;
		pdfError = false;
		onrefresh?.();
	}

	function onKeydown(e: KeyboardEvent) {
		if (open && !wopiOpen && e.key === 'Escape') close();
	}

	function zoomBy(factor: number) {
		zoom = Math.max(0.1, Math.min(5, zoom * factor));
	}

	function resetZoom() {
		zoom = 1;
	}

	// Load text content + decide editability/auto-open whenever the file changes.
	$effect(() => {
		if (!open || !file) return;
		const f = file;
		canEdit = false;
		zoom = 1;
		const k = kindOf(f);

		// Office docs (WOPI-editable, non-image) open straight in the editor
		// rather than showing "No preview available" with an extra Edit click.
		// Images never route through WOPI even if an editor claims the ext.
		if (k === 'other' && !isImage(f)) {
			void canEditWithWopi(f.name).then((v) => {
				canEdit = v;
				if (v && file === f && open) wopiOpen = true;
			});
		} else {
			void canEditWithWopi(f.name).then((v) => (canEdit = v));
		}

		if (k === 'text') {
			textLoading = true;
			textContent = '';
			apiFetch(fileInlineUrl(f.id), { credentials: 'same-origin' })
				.then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
				.then((txt) => (textContent = txt.slice(0, 500_000)))
				.catch(() => (textContent = t('files.preview_failed', 'Could not load preview.')))
				.finally(() => (textLoading = false));
		}

		// Fetch the PDF as a same-origin blob and view it via an object URL (see
		// `pdfUrl`). The cleanup revokes the URL when the file changes or the
		// viewer closes; a stale response (newer file opened mid-fetch) is dropped.
		if (k === 'pdf') {
			pdfError = false;
			pdfUrl = null;
			let objectUrl: string | null = null;
			apiFetch(fileInlineUrl(f.id), { credentials: 'same-origin' })
				.then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
				.then((blob) => {
					if (file !== f || !open) return;
					objectUrl = URL.createObjectURL(blob);
					pdfUrl = objectUrl;
				})
				.catch(() => (pdfError = true));
			return () => {
				if (objectUrl) URL.revokeObjectURL(objectUrl);
				pdfUrl = null;
			};
		}
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && file}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[1000] flex items-center justify-center bg-neutral/80 p-4 sm:p-8"
		role="dialog"
		data-testid="file-viewer-dialog"
		aria-modal="true"
		aria-label={file.name}
		tabindex="-1"
		onclick={(e) => e.target === e.currentTarget && close()}
	>
		<div
			class="flex h-[min(90vh,100%)] w-[min(1100px,100%)] flex-col overflow-hidden rounded-box bg-base-100 shadow-xl"
		>
			<header class="flex items-center justify-between gap-4 border-b border-base-300 px-3.5 py-2">
				<span class="truncate font-semibold text-base-content">{file.name}</span>
				<div class="flex shrink-0 items-center gap-1.5">
					{#if kind === 'image'}
						<div class="join mr-1" role="group" aria-label={t('viewer.zoom', 'Zoom')}>
							<button
								class="btn btn-square join-item btn-sm"
								data-testid="file-viewer-zoom-out-btn"
								title={t('viewer.zoom_out', 'Zoom out')}
								aria-label={t('viewer.zoom_out', 'Zoom out')}
								onclick={() => zoomBy(0.8)}
							>
								<Icon name="search-minus" />
							</button>
							<button
								class="btn btn-square join-item btn-sm"
								data-testid="file-viewer-zoom-reset-btn"
								title={t('viewer.zoom_reset', 'Reset zoom')}
								aria-label={t('viewer.zoom_reset', 'Reset zoom')}
								onclick={resetZoom}
							>
								<Icon name="expand" />
							</button>
							<button
								class="btn btn-square join-item btn-sm"
								data-testid="file-viewer-zoom-in-btn"
								title={t('viewer.zoom_in', 'Zoom in')}
								aria-label={t('viewer.zoom_in', 'Zoom in')}
								onclick={() => zoomBy(1.2)}
							>
								<Icon name="search-plus" />
							</button>
						</div>
					{/if}
					{#if canEdit}
						<button
							class="btn btn-primary btn-sm"
							data-testid="file-viewer-edit-btn"
							onclick={() => (wopiOpen = true)}
						>
							<Icon name="pen" />
							{t('files.edit', 'Edit')}
						</button>
					{/if}
					<a
						class="btn btn-sm"
						data-testid="file-viewer-download-link"
						href={fileDownloadUrl(file.id)}
						download
						rel="external"
					>
						<Icon name="download" />
						{t('common.download', 'Download')}
					</a>
					<a
						class="btn btn-square btn-sm"
						data-testid="file-viewer-open-new-tab-link"
						href={fileInlineUrl(file.id)}
						target="_blank"
						rel="external noreferrer"
						aria-label={t('viewer.open_new_tab', 'Open in new tab')}
					>
						<Icon name="external-link-alt" />
					</a>
					<button
						class="btn btn-circle btn-ghost btn-sm"
						data-testid="file-viewer-close-btn"
						aria-label={t('common.close', 'Close')}
						onclick={close}
					>
						<Icon name="times" />
					</button>
				</div>
			</header>

			<div class="flex flex-1 items-center justify-center overflow-auto bg-base-200">
				{#if kind === 'image'}
					<img
						class="max-h-full max-w-full object-contain transition-transform duration-100 ease-out"
						src={fileInlineUrl(file.id)}
						alt={file.name}
						style:transform="scale({zoom})"
					/>
				{:else if kind === 'video'}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						class="max-h-full max-w-full object-contain"
						src={fileInlineUrl(file.id)}
						controls
						preload="metadata"
					></video>
				{:else if kind === 'audio'}
					<audio class="w-[min(600px,90%)]" src={fileInlineUrl(file.id)} controls></audio>
				{:else if kind === 'pdf'}
					{#if pdfError}
						<div class="flex flex-col items-center gap-3 text-base-content/60">
							<Icon name="file" class="text-5xl" />
							<p>{t('files.preview_failed', 'Could not load preview.')}</p>
						</div>
					{:else if pdfUrl}
						<iframe class="h-full w-full border-0" src={pdfUrl} title={file.name}></iframe>
					{:else}
						<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
					{/if}
				{:else if kind === 'text'}
					{#if textLoading}
						<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
					{:else}
						<pre
							class="m-0 h-full w-full overflow-auto whitespace-pre-wrap break-words bg-base-100 p-4 font-mono text-sm text-base-content">{textContent}</pre>
					{/if}
				{:else}
					<div class="flex flex-col items-center gap-3 text-base-content/60">
						<Icon name="file" class="text-5xl" />
						<p>{t('files.no_preview', 'No preview available for this file type.')}</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<WopiEditor
		bind:open={wopiOpen}
		fileId={file.id}
		fileName={file.name}
		action="edit"
		onclose={() => {
			onrefresh?.();
			// If the editor was auto-opened for an Office doc, closing it should
			// dismiss the whole viewer (there's nothing to preview behind it).
			if (kind === 'other') close();
		}}
	/>
{/if}
