<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		getShareContents,
		getShareMeta,
		shareDownloadUrl,
		shareFileUrl,
		shareZipUrl,
		verifySharePassword,
		type ShareListing,
		type ShareMeta
	} from '$lib/api/endpoints/share';
	import { t } from '$lib/i18n/index.svelte';

	type State = 'loading' | 'password' | 'expired' | 'invalid' | 'file' | 'folder';
	type Crumb = { id?: string; name: string };
	type ViewMode = 'grid' | 'list';

	const VIEW_KEY = 'oxi-share-view';
	const token = $derived(page.params.token ?? '');

	let view = $state<State>('loading');
	let meta = $state<ShareMeta | null>(null);
	let listing = $state<ShareListing | null>(null);
	let folderId = $state<string | undefined>(undefined);
	let crumbs = $state<Crumb[]>([]);
	let pwInput = $state('');
	let pwError = $state('');
	let busy = $state(false);
	let viewMode = $state<ViewMode>('grid');

	// Lightbox over the media files in the current folder
	let lightbox = $state(-1);

	function mediaKind(mime: string | undefined): 'image' | 'video' | null {
		const m = (mime ?? '').toLowerCase();
		if (m.startsWith('image/')) return 'image';
		if (m.startsWith('video/')) return 'video';
		return null;
	}

	const mediaFiles = $derived(
		(listing?.files ?? []).filter((f) => mediaKind(f.mime_type) !== null)
	);

	function setViewMode(mode: ViewMode) {
		viewMode = mode;
		try {
			localStorage.setItem(VIEW_KEY, mode);
		} catch {
			/* storage unavailable — keep in-memory only */
		}
	}

	async function loadMeta() {
		view = 'loading';
		// Guard a missing/blank token before hitting the API.
		if (!token) {
			view = 'invalid';
			return;
		}
		try {
			const r = await getShareMeta(token);
			if (r.status === 'password') {
				view = 'password';
			} else if (r.status === 'expired') {
				view = 'expired';
			} else if (r.status === 'invalid') {
				view = 'invalid';
			} else {
				meta = r.data;
				if (r.data.item_type === 'folder') {
					crumbs = [{ name: r.data.item_name }];
					// Deep-link support: honour an initial #folder=<id> hash.
					await openFolder(hashFolderId(), undefined, false);
				} else view = 'file';
			}
		} catch {
			view = 'expired';
		}
	}

	/** Parse the `#folder=<id>` fragment from the URL, if present. */
	function hashFolderId(): string | undefined {
		if (typeof location === 'undefined') return undefined;
		const m = location.hash.match(/[#&]folder=([A-Za-z0-9-]{1,64})/);
		return m ? m[1] : undefined;
	}

	/**
	 * Load a folder's contents. When `crumb` is given, push it onto the trail.
	 * `pushHistory` controls whether we sync the URL hash + push a history entry
	 * (true for user navigation, false when restoring from popstate / deep link).
	 */
	async function openFolder(id: string | undefined, crumb?: Crumb, pushHistory = false) {
		const r = await getShareContents(token, id);
		if (r.status === 'password') {
			view = 'password';
			return;
		}
		if (r.status === 'expired') {
			view = 'expired';
			return;
		}
		listing = r.data;
		folderId = id;
		if (crumb) crumbs = [...crumbs, crumb];
		lightbox = -1;
		view = 'folder';
		if (pushHistory && typeof history !== 'undefined') {
			const hash = id ? `#folder=${encodeURIComponent(id)}` : '';
			history.pushState({ folderId: id }, '', location.pathname + location.search + hash);
		}
	}

	/** Navigate to a breadcrumb at depth `index` (0 = share root). */
	async function gotoCrumb(index: number) {
		const target = crumbs[index];
		crumbs = crumbs.slice(0, index + 1);
		await openFolder(target.id, undefined, true);
	}

	/** Browser back/forward — re-resolve the folder from the popped state/hash. */
	async function onPopState() {
		if (view !== 'folder') return;
		await openFolder(hashFolderId(), undefined, false);
	}

	/** Append a cache-busting query param to retry a failed media load once. */
	function retrySrc(original: string): string {
		const sep = original.indexOf('?') === -1 ? '?' : '&';
		return `${original}${sep}_r=${Date.now()}`;
	}

	/**
	 * Lazy video poster: defer loading until near the viewport, then seek a few
	 * frames in to render a thumbnail. Retries once with cache-busting on error.
	 * Ported from publicShare.js wireLazyVideos().
	 */
	function lazyVideo(node: HTMLVideoElement, src: string) {
		let retried = false;
		const start = () => {
			node.addEventListener(
				'loadedmetadata',
				() => {
					const at = Math.min(0.1, (node.duration || 1) * 0.1);
					try {
						node.currentTime = at;
					} catch {
						/* seeking unsupported */
					}
				},
				{ once: true }
			);
			node.addEventListener(
				'error',
				() => {
					if (retried) return;
					retried = true;
					setTimeout(() => (node.src = retrySrc(src)), 250);
				},
				{ once: true }
			);
			node.src = src;
		};
		let obs: IntersectionObserver | null = null;
		if (typeof IntersectionObserver !== 'undefined') {
			obs = new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						if (e.isIntersecting) {
							start();
							obs?.unobserve(node);
						}
					}
				},
				{ rootMargin: '300px' }
			);
			obs.observe(node);
		} else {
			start();
		}
		return { destroy: () => obs?.disconnect() };
	}

	/** Retry a failed image load once with cache-busting. Ported from wireImageRetry(). */
	function imageRetry(node: HTMLImageElement) {
		let retried = false;
		const onError = () => {
			if (retried) return;
			retried = true;
			const original = node.src;
			setTimeout(() => (node.src = retrySrc(original)), 250);
		};
		node.addEventListener('error', onError);
		return { destroy: () => node.removeEventListener('error', onError) };
	}

	function lbPrev() {
		if (lightbox > 0) lightbox -= 1;
	}
	function lbNext() {
		if (lightbox >= 0 && lightbox < mediaFiles.length - 1) lightbox += 1;
	}
	function onKeydown(e: KeyboardEvent) {
		if (lightbox < 0) return;
		if (e.key === 'Escape') lightbox = -1;
		else if (e.key === 'ArrowLeft') lbPrev();
		else if (e.key === 'ArrowRight') lbNext();
	}

	async function submitPassword(e: SubmitEvent) {
		e.preventDefault();
		if (!pwInput) return;
		busy = true;
		pwError = '';
		try {
			const ok = await verifySharePassword(token, pwInput);
			if (!ok) {
				pwError = t('share.bad_password', 'Incorrect password. Please try again.');
				return;
			}
			await loadMeta();
		} catch {
			pwError = t('share.error', 'Something went wrong. Please try again.');
		} finally {
			busy = false;
		}
	}

	// View-mode class sets (was `.share__grid[--list]` / `.card*` BEM rules).
	const gridClass = $derived(
		viewMode === 'list'
			? 'm-0 flex list-none flex-col gap-1 p-0'
			: 'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 p-0'
	);
	const cardClass = $derived(
		viewMode === 'list'
			? 'border-base-300 bg-base-100 text-base-content hover:bg-base-200 flex w-full cursor-pointer flex-row items-center gap-3 rounded-box border px-2.5 py-1.5 no-underline'
			: 'border-base-300 bg-base-100 text-base-content hover:bg-base-200 flex w-full cursor-pointer flex-col items-center gap-2 rounded-box border p-2 no-underline'
	);
	const thumbClass = $derived(
		viewMode === 'list'
			? 'bg-base-200 relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg'
			: 'bg-base-200 relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg'
	);
	const nameClass = $derived(
		viewMode === 'list'
			? 'flex-1 truncate text-left text-[0.8125rem]'
			: 'max-w-full truncate text-center text-[0.8125rem]'
	);

	onMount(() => {
		try {
			const saved = localStorage.getItem(VIEW_KEY);
			if (saved === 'list' || saved === 'grid') viewMode = saved;
		} catch {
			/* ignore */
		}
		void loadMeta();
	});
</script>

<svelte:head><title>{meta?.item_name ?? t('share.title', 'Shared')} · OxiCloud</title></svelte:head>
<svelte:window onkeydown={onKeydown} onpopstate={onPopState} />

<main class="mx-auto max-w-5xl px-4 py-8">
	{#if view === 'loading'}
		<p class="text-base-content/60 py-12 text-center">{t('common.loading', 'Loading…')}</p>
	{:else if view === 'invalid'}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon name="ban" class="text-base-content/40 text-5xl" />
			<p>{t('share.invalid', 'This share link is invalid.')}</p>
		</div>
	{:else if view === 'expired'}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon name="ban" class="text-base-content/40 text-5xl" />
			<p>{t('share.expired', 'This share link is no longer available.')}</p>
		</div>
	{:else if view === 'password'}
		<form
			class="mx-auto my-16 flex w-full max-w-sm flex-col gap-3"
			data-testid="public-share-password-form"
			onsubmit={submitPassword}
		>
			<h1 class="text-xl font-bold">{t('share.password_title', 'Password required')}</h1>
			<input
				type="password"
				class="input w-full"
				data-testid="public-share-password-input"
				bind:value={pwInput}
				placeholder={t('share.password', 'Password')}
				disabled={busy}
				autocomplete="off"
			/>
			{#if pwError}<p class="text-error m-0 text-sm" role="alert">{pwError}</p>{/if}
			<button
				type="submit"
				class="btn btn-primary"
				data-testid="public-share-unlock-btn"
				disabled={busy}>{t('share.unlock', 'Unlock')}</button
			>
		</form>
	{:else if view === 'file'}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<Icon name="file" class="text-base-content/40 text-5xl" />
			<h1 class="text-xl font-bold">{meta?.item_name}</h1>
			<a
				class="btn btn-primary"
				data-testid="public-share-download-btn"
				href={shareDownloadUrl(token)}
				download
				rel="external"
			>
				{t('share.download', 'Download')}
			</a>
		</div>
	{:else if view === 'folder' && listing}
		<header class="mb-4 flex flex-wrap items-center justify-between gap-4">
			<nav
				class="flex flex-wrap items-center gap-1.5"
				aria-label={t('files.breadcrumb', 'Breadcrumb')}
			>
				{#each crumbs as c, i (i)}
					{#if i > 0}<Icon name="chevron-right" class="text-base-content/60 text-xs" />{/if}
					{#if i === crumbs.length - 1}
						<span class="font-semibold">{c.name}</span>
					{:else}
						<button
							class="text-primary cursor-pointer border-none bg-transparent p-0 text-base hover:underline"
							data-testid={`public-share-breadcrumb-${i}`}
							onclick={() => gotoCrumb(i)}>{c.name}</button
						>
					{/if}
				{/each}
			</nav>
			<div class="flex items-center gap-3">
				<div class="join" role="group" aria-label={t('files.view', 'View')}>
					<button
						type="button"
						class="btn btn-sm join-item {viewMode === 'grid' ? 'btn-active' : ''}"
						aria-pressed={viewMode === 'grid'}
						data-testid="public-share-view-grid-btn"
						title={t('files.grid', 'Grid')}
						onclick={() => setViewMode('grid')}><Icon name="th" /></button
					>
					<button
						type="button"
						class="btn btn-sm join-item {viewMode === 'list' ? 'btn-active' : ''}"
						aria-pressed={viewMode === 'list'}
						data-testid="public-share-view-list-btn"
						title={t('files.list', 'List')}
						onclick={() => setViewMode('list')}><Icon name="bars" /></button
					>
				</div>
				<a
					class="btn btn-primary"
					data-testid="public-share-download-zip-btn"
					href={shareZipUrl(token, folderId)}
					download
					rel="external"
				>
					<Icon name="file-archive" />
					{t('share.download_zip', 'Download ZIP')}
				</a>
			</div>
		</header>

		{#if listing.folders.length === 0 && listing.files.length === 0}
			<p class="text-base-content/60 py-12 text-center">
				{t('share.empty_folder', 'This folder is empty.')}
			</p>
		{/if}

		{#if listing.folders.length > 0}
			<h2 class="text-base-content/60 mt-6 mb-2 text-base">{t('share.folders', 'Folders')}</h2>
			<ul class={gridClass}>
				{#each listing.folders as f (f.id)}
					<li>
						<button
							class={cardClass}
							data-testid={f.name}
							onclick={() => openFolder(f.id, { id: f.id, name: f.name }, true)}
						>
							<span class={thumbClass}
								><Icon name="folder" class="text-base-content/50 text-3xl" /></span
							>
							<span class={nameClass}>{f.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if listing.files.length > 0}
			<h2 class="text-base-content/60 mt-6 mb-2 text-base">{t('share.files', 'Files')}</h2>
			<ul class={gridClass}>
				{#each listing.files as f (f.id)}
					{@const kind = mediaKind(f.mime_type)}
					{#if kind}
						<li>
							<button
								class={cardClass}
								data-testid={f.name}
								onclick={() => (lightbox = mediaFiles.findIndex((m) => m.id === f.id))}
							>
								<span class={thumbClass}>
									{#if kind === 'image'}
										<img
											class="h-full w-full object-cover"
											src={shareFileUrl(token, f.id)}
											alt={f.name}
											loading="lazy"
											decoding="async"
											use:imageRetry
										/>
									{:else}
										<video
											class="h-full w-full object-cover"
											use:lazyVideo={shareFileUrl(token, f.id)}
											preload="metadata"
											muted
											playsinline
										></video>
										<span
											class="text-neutral-content bg-neutral/30 absolute inset-0 grid place-items-center text-2xl opacity-85"
											><Icon name="play" /></span
										>
									{/if}
								</span>
								<span class={nameClass}>{f.name}</span>
							</button>
						</li>
					{:else}
						<li>
							<a
								class={cardClass}
								data-testid={f.name}
								href={shareFileUrl(token, f.id)}
								target="_blank"
								rel="external noreferrer"
							>
								<span class={thumbClass}
									><Icon name="file" class="text-base-content/50 text-3xl" /></span
								>
								<span class={nameClass}>{f.name}</span>
							</a>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	{/if}
</main>

{#if lightbox >= 0 && mediaFiles[lightbox]}
	{@const m = mediaFiles[lightbox]}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="bg-neutral/90 fixed inset-0 z-[1000] flex items-center justify-center"
		role="dialog"
		data-testid="public-share-lightbox-dialog"
		aria-modal="true"
		aria-label={m.name}
		tabindex="-1"
		onclick={(e) => e.target === e.currentTarget && (lightbox = -1)}
	>
		<button
			class="btn btn-circle btn-ghost text-neutral-content hover:bg-neutral-content/10 absolute top-4 right-4 text-2xl"
			data-testid="public-share-lightbox-close-btn"
			aria-label={t('common.close', 'Close')}
			onclick={() => (lightbox = -1)}>×</button
		>
		<button
			class="btn btn-circle btn-ghost text-neutral-content hover:bg-neutral-content/10 disabled:text-neutral-content/30 absolute top-1/2 left-2 -translate-y-1/2 text-2xl disabled:bg-transparent"
			data-testid="public-share-lightbox-prev-btn"
			aria-label={t('common.previous', 'Previous')}
			disabled={lightbox === 0}
			onclick={(e) => {
				e.stopPropagation();
				lbPrev();
			}}><Icon name="chevron-left" /></button
		>
		{#if mediaKind(m.mime_type) === 'image'}
			<img
				class="max-h-[88vh] max-w-[92vw] object-contain"
				src={shareFileUrl(token, m.id)}
				alt={m.name}
			/>
		{:else}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				class="max-h-[88vh] max-w-[92vw] object-contain"
				src={shareFileUrl(token, m.id)}
				controls
				autoplay
			></video>
		{/if}
		<button
			class="btn btn-circle btn-ghost text-neutral-content hover:bg-neutral-content/10 disabled:text-neutral-content/30 absolute top-1/2 right-2 -translate-y-1/2 text-2xl disabled:bg-transparent"
			data-testid="public-share-lightbox-next-btn"
			aria-label={t('common.next', 'Next')}
			disabled={lightbox === mediaFiles.length - 1}
			onclick={(e) => {
				e.stopPropagation();
				lbNext();
			}}><Icon name="chevron-right" /></button
		>
	</div>
{/if}
