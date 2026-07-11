<script lang="ts">
	import { useSelection } from '$lib/composables/useSelection.svelte';
	import { errorMessage, errorToast } from '$lib/utils/errors';
	import { onMount } from 'svelte';
	import { fileInlineUrl } from '$lib/api/endpoints/files';
	import {
		addTracks,
		createPlaylist,
		deletePlaylist,
		listPlaylists,
		listShares,
		listTracks,
		removeShare,
		removeTrack,
		renamePlaylist,
		reorderTracks,
		sharePlaylist,
		updatePlaylist,
		uploadCoverImage,
		type MusicShare,
		type Playlist,
		type PlaylistItem
	} from '$lib/api/endpoints/music';
	import { searchFiles } from '$lib/api/endpoints/search';
	import type { FileItem } from '$lib/api/types';
	import Icon from '$lib/icons/Icon.svelte';
	import { confirmDialog, promptDialog } from '$lib/stores/dialogs.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { ui } from '$lib/stores/ui.svelte';

	let playlists = $state<Playlist[]>([]);
	let current = $state<Playlist | null>(null);
	let tracks = $state<PlaylistItem[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let dragIndex = $state<number | null>(null);

	// ── Player (independent global queue) ──────────────────────────────────────
	let audio = $state<HTMLAudioElement | null>(null);
	/** Playback queue — independent of the visible `tracks` list. */
	let queue = $state<PlaylistItem[]>([]);
	let currentIndex = $state(-1);
	let playing = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(0.7);
	let muted = $state(false);
	let shuffle = $state(false);
	let repeat = $state<'none' | 'all' | 'one'>('none');
	let queueOpen = $state(false);

	const currentTrack = $derived(currentIndex >= 0 ? (queue[currentIndex] ?? null) : null);

	function fmtTime(s: number | null | undefined): string {
		if (s == null || !Number.isFinite(s)) return '0:00';
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}
	function fmtDuration(s: number | null | undefined): string {
		return s ? fmtTime(s) : '-';
	}

	async function loadPlaylists() {
		loading = true;
		error = null;
		try {
			playlists = await listPlaylists();
			if (!current && playlists.length > 0) await select(playlists[0]);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loading = false;
		}
	}

	async function select(p: Playlist) {
		current = p;
		// NOTE: do NOT touch the player here — browsing a playlist must not stop playback.
		try {
			tracks = await listTracks(p.id);
		} catch (e) {
			errorToast(e);
		}
	}

	async function onCreate() {
		const name = await promptDialog({
			title: t('music.new_playlist', 'New playlist'),
			confirmText: t('common.create', 'Create')
		});
		if (!name) return;
		try {
			const p = await createPlaylist(name);
			playlists = [p, ...playlists];
			await select(p);
			ui.notify(t('music.created', { name: p.name }, 'Created “{{name}}”.'), 'success');
		} catch (e) {
			errorToast(e);
		}
	}

	async function onRenamePlaylist() {
		if (!current) return;
		const name = await promptDialog({
			title: t('music.rename_playlist', 'Rename playlist'),
			defaultValue: current.name,
			confirmText: t('common.save', 'Save')
		});
		if (!name || name === current.name) return;
		try {
			await renamePlaylist(current.id, name);
			current.name = name;
			playlists = playlists.map((p) => (p.id === current!.id ? { ...p, name } : p));
		} catch (e) {
			errorToast(e);
		}
	}

	async function onEditDescription() {
		if (!current) return;
		const desc = await promptDialog({
			title: t('music.edit_description', 'Edit description'),
			defaultValue: current.description ?? '',
			confirmText: t('common.save', 'Save')
		});
		if (desc === null) return;
		try {
			await updatePlaylist(current.id, { description: desc || null });
			current.description = desc || null;
			playlists = playlists.map((p) =>
				p.id === current!.id ? { ...p, description: desc || null } : p
			);
		} catch (e) {
			errorToast(e);
		}
	}

	async function onDelete(p: Playlist) {
		const ok = await confirmDialog({
			title: t('music.delete_playlist', 'Delete playlist'),
			message: t('music.confirm_delete', { name: p.name }, 'Delete playlist "{{name}}"?'),
			confirmText: t('common.delete', 'Delete'),
			danger: true
		});
		if (!ok) return;
		try {
			await deletePlaylist(p.id);
			playlists = playlists.filter((x) => x.id !== p.id);
			if (current?.id === p.id) {
				current = playlists[0] ?? null;
				tracks = current ? await listTracks(current.id) : [];
			}
			ui.notify(t('music.deleted', { name: p.name }, 'Deleted “{{name}}”.'), 'success');
		} catch (e) {
			errorToast(e);
		}
	}

	async function onRemoveTrack(track: PlaylistItem) {
		if (!current) return;
		try {
			await removeTrack(current.id, track.file_id);
			tracks = tracks.filter((x) => x.id !== track.id);
			ui.notify(t('music.track_removed', 'Track removed.'), 'success');
		} catch (e) {
			errorToast(e);
		}
	}

	async function onTogglePublic() {
		if (!current) return;
		const nextPublic = !current.is_public;
		try {
			await updatePlaylist(current.id, { is_public: nextPublic });
			current.is_public = nextPublic;
			playlists = playlists.map((p) =>
				p.id === current!.id ? { ...p, is_public: nextPublic } : p
			);
			ui.notify(
				nextPublic
					? t('music.now_public', 'Playlist is now public.')
					: t('music.now_private', 'Playlist is now private.'),
				'success'
			);
		} catch (e) {
			errorToast(e);
		}
	}

	function onDragStart(i: number) {
		dragIndex = i;
	}
	function onDragOver(e: DragEvent, i: number) {
		e.preventDefault();
		if (dragIndex === null || dragIndex === i) return;
		const reordered = [...tracks];
		const [moved] = reordered.splice(dragIndex, 1);
		reordered.splice(i, 0, moved);
		dragIndex = i;
		tracks = reordered;
	}
	async function onDrop() {
		dragIndex = null;
		if (!current) return;
		try {
			await reorderTracks(
				current.id,
				tracks.map((tr) => tr.id)
			);
			ui.notify(t('music.reordered', 'Playlist reordered.'), 'success');
		} catch (e) {
			errorToast(e);
			await select(current);
		}
	}

	function trackLabel(tr: PlaylistItem): string {
		return tr.title || tr.file_name || tr.file_id;
	}

	// ── Transport (operates on the independent queue) ──────────────────────────
	/** Replace the queue (e.g. when starting playback of the visible playlist). */
	function setQueue(list: PlaylistItem[]) {
		queue = [...list];
	}

	function playIndex(i: number) {
		if (i < 0 || i >= queue.length) return;
		currentIndex = i;
		// $effect swaps the src; ensure playback starts.
		queueMicrotask(() => audio?.play().catch(() => {}));
	}

	/** Play the visible playlist from a given row, seeding the queue from it. */
	function playFromTracks(i: number) {
		if (i < 0 || i >= tracks.length) return;
		setQueue(tracks);
		playIndex(i);
	}

	function playAll() {
		if (tracks.length) playFromTracks(0);
	}

	function shufflePlay() {
		if (!tracks.length) return;
		const shuffled = [...tracks];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		setQueue(shuffled);
		playIndex(0);
	}

	function togglePlay() {
		if (!audio) return;
		if (currentIndex < 0 && queue.length) {
			playIndex(0);
			return;
		}
		if (playing) audio.pause();
		else audio.play().catch(() => {});
	}
	function next() {
		if (!queue.length) return;
		if (shuffle) {
			playIndex(Math.floor(Math.random() * queue.length));
			return;
		}
		if (currentIndex + 1 < queue.length) playIndex(currentIndex + 1);
		else if (repeat === 'all') playIndex(0);
	}
	function prev() {
		if (!queue.length) return;
		if (currentTime > 3 && audio) {
			audio.currentTime = 0;
			return;
		}
		// Wrap to the last track when at the start (OLD behavior).
		playIndex(currentIndex > 0 ? currentIndex - 1 : queue.length - 1);
	}
	function onEnded() {
		if (repeat === 'one') {
			if (audio) audio.currentTime = 0;
			audio?.play().catch(() => {});
			return;
		}
		next();
	}
	function seek(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (audio) audio.currentTime = v;
	}
	function applyVolume() {
		if (audio) {
			audio.volume = volume;
			audio.muted = muted;
		}
	}
	function setVolume(e: Event) {
		volume = Number((e.target as HTMLInputElement).value);
		muted = volume === 0;
		applyVolume();
	}
	function toggleMute() {
		muted = !muted;
		applyVolume();
	}
	function cycleRepeat() {
		repeat = repeat === 'none' ? 'all' : repeat === 'all' ? 'one' : 'none';
	}

	const volumeIcon = $derived(muted || volume === 0 ? 'volume' : 'volume-up');

	function jumpQueue(i: number) {
		playIndex(i);
	}
	function removeFromQueue(i: number) {
		const nextQueue = [...queue];
		nextQueue.splice(i, 1);
		if (i === currentIndex) {
			queue = nextQueue;
			if (nextQueue.length === 0) {
				audio?.pause();
				currentIndex = -1;
			} else {
				playIndex(i >= nextQueue.length ? 0 : i);
			}
		} else {
			if (i < currentIndex) currentIndex -= 1;
			queue = nextQueue;
		}
	}

	/** Live duration backfill: write the real duration into rows/queue lacking it. */
	function onLoadedMetadata() {
		duration = audio?.duration ?? 0;
		const tr = currentTrack;
		if (tr && audio?.duration && !tr.duration_secs) {
			const secs = Math.round(audio.duration);
			tr.duration_secs = secs;
			queue = queue.map((q) => (q.id === tr.id ? { ...q, duration_secs: secs } : q));
			tracks = tracks.map((q) => (q.id === tr.id ? { ...q, duration_secs: secs } : q));
		}
	}

	function onAudioError() {
		if (!currentTrack) return;
		ui.notify(
			t('music.playback_error', { name: trackLabel(currentTrack) }, 'Playback error: {{name}}'),
			'error'
		);
		playing = false;
	}

	// Keep the <audio> src in sync with the current queued track.
	$effect(() => {
		if (audio && currentTrack) {
			const url = fileInlineUrl(currentTrack.file_id);
			if (audio.getAttribute('src') !== url) audio.src = url;
		}
	});

	// ── Cover art picker ───────────────────────────────────────────────────────
	let coverInput = $state<HTMLInputElement | null>(null);

	function pickCover() {
		coverInput?.click();
	}
	async function onCoverChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !current) return;
		try {
			const fileId = await uploadCoverImage(file);
			await updatePlaylist(current.id, { cover_file_id: fileId });
			current.cover_file_id = fileId;
			playlists = playlists.map((p) =>
				p.id === current!.id ? { ...p, cover_file_id: fileId } : p
			);
			ui.notify(t('music.cover_updated', 'Cover updated.'), 'success');
		} catch (err) {
			errorToast(err);
		}
	}

	function coverUrl(p: Playlist | null): string | null {
		return p?.cover_file_id ? `/api/files/${encodeURIComponent(p.cover_file_id)}` : null;
	}

	// ── Share dialog ───────────────────────────────────────────────────────────
	let sharesOpen = $state(false);
	let shares = $state<MusicShare[]>([]);
	let shareUser = $state('');
	let shareCanWrite = $state(false);
	let sharesLoading = $state(false);

	async function openShares() {
		if (!current) return;
		sharesOpen = true;
		await loadShares();
	}
	async function loadShares() {
		if (!current) return;
		sharesLoading = true;
		try {
			shares = await listShares(current.id);
		} catch (e) {
			errorToast(e);
		} finally {
			sharesLoading = false;
		}
	}
	async function onAddShare() {
		if (!current || !shareUser.trim()) return;
		try {
			await sharePlaylist(current.id, shareUser.trim(), shareCanWrite);
			shareUser = '';
			shareCanWrite = false;
			await loadShares();
			ui.notify(t('music.share_added', 'Shared.'), 'success');
		} catch (e) {
			errorToast(e);
		}
	}
	async function onRemoveShare(userId: string) {
		if (!current) return;
		try {
			await removeShare(current.id, userId);
			await loadShares();
		} catch (e) {
			errorToast(e);
		}
	}

	// ── Add tracks dialog ──────────────────────────────────────────────────────
	const AUDIO_TYPES = ['mp3', 'ogg', 'flac', 'wav', 'aac', 'm4a', 'wma', 'opus', 'webm'];
	let addOpen = $state(false);
	let addQuery = $state('');
	let addResults = $state<FileItem[]>([]);
	const addSelected = useSelection();
	let addSearching = $state(false);
	let addDebounce: ReturnType<typeof setTimeout> | null = null;

	async function runAddSearch(query = '') {
		addSearching = true;
		try {
			const res = await searchFiles(query.trim(), {
				recursive: true,
				fileTypes: AUDIO_TYPES,
				limit: 200
			});
			// Belt-and-braces: keep only audio mime types.
			addResults = res.files.filter(
				(f) =>
					(f.mime_type ?? '').startsWith('audio/') ||
					AUDIO_TYPES.some((e) => f.name.toLowerCase().endsWith(`.${e}`))
			);
		} catch (e) {
			errorToast(e);
			addResults = [];
		} finally {
			addSearching = false;
		}
	}
	function onAddQueryInput() {
		if (addDebounce) clearTimeout(addDebounce);
		addDebounce = setTimeout(() => runAddSearch(addQuery), 300);
	}
	function openAdd() {
		addOpen = true;
		addQuery = '';
		addResults = [];
		addSelected.clear();
		void runAddSearch(''); // show all audio files immediately
	}
	async function confirmAdd() {
		if (!current || addSelected.size === 0) return;
		const count = addSelected.size;
		try {
			await addTracks(current.id, addSelected.values());
			addOpen = false;
			tracks = await listTracks(current.id);
			ui.notify(t('music.tracks_added', { n: count }, 'Added {{n}} track(s).'), 'success');
		} catch (e) {
			errorToast(e);
		}
	}

	onMount(loadPlaylists);
</script>

<svelte:head><title>{t('nav.music', 'Music')} · OxiCloud</title></svelte:head>

<div class={currentTrack ? 'pb-[110px]' : ''}>
	{#if error}
		<div class="flex flex-col items-center justify-center p-10 text-center text-error">
			<Icon name="exclamation-circle" class="mb-4 text-6xl" />
			<p class="m-0">{error}</p>
		</div>
	{:else if loading && playlists.length === 0}
		<div class="flex items-center justify-center p-10 text-base-content/60">
			<span class="loading loading-spinner loading-md"></span>
		</div>
	{:else if playlists.length === 0}
		<div
			class="flex min-h-[calc(100dvh-260px)] flex-col items-center justify-center px-10 py-20 text-center"
		>
			<div
				class="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 text-5xl text-primary shadow-lg"
			>
				<Icon name="music" />
			</div>
			<h3 class="m-0 mb-2 text-xl font-semibold text-base-content">
				{t('music.no_playlists', 'No playlists yet.')}
			</h3>
			<p class="m-0 mb-7 max-w-[360px] text-base text-base-content/60">
				{t('music.empty_hint', 'Create a playlist to start collecting your tracks.')}
			</p>
			<button
				class="btn btn-primary"
				data-testid="music-create-playlist-empty-btn"
				onclick={onCreate}
			>
				<Icon name="plus" />
				<span>{t('music.create_playlist', 'Create playlist')}</span>
			</button>
		</div>
	{:else}
		<div class="flex min-h-[400px] flex-col md:h-[calc(100dvh-200px)] md:flex-row">
			<div
				class="flex max-h-[200px] w-full flex-col border-b border-base-300 bg-base-100 md:max-h-none md:w-[280px] md:min-w-[280px] md:border-b-0 md:border-r"
			>
				<div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
					<h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-base-content/60">
						{t('music.playlists', 'Playlists')}
					</h3>
					<button
						class="btn btn-square btn-primary btn-sm"
						title={t('music.create_playlist', 'Create playlist')}
						aria-label={t('music.create_playlist', 'Create playlist')}
						data-testid="music-create-playlist-btn"
						onclick={onCreate}
					>
						<Icon name="plus" />
					</button>
				</div>
				<div class="flex-1 overflow-y-auto p-2">
					{#each playlists as p (p.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-base-200 {current?.id ===
							p.id
								? 'bg-base-200'
								: ''}"
							data-testid={p.name}
							onclick={() => select(p)}
						>
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-base text-primary"
							>
								<Icon name="music" />
							</div>
							<div class="min-w-0 flex-1">
								<span class="block truncate font-medium text-base-content">{p.name}</span>
								<span class="block text-xs text-base-content/60"
									>{p.track_count}
									{t('music.tracks', 'tracks')}</span
								>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="flex-1 overflow-y-auto p-6">
				{#if current}
					<div class="max-w-[900px]">
						<div class="mb-6 flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-6">
							<button
								class="group relative flex h-[120px] w-[120px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-primary/15 text-4xl text-primary shadow-lg md:h-[140px] md:w-[140px] md:text-6xl"
								title={t('music.set_cover', 'Set cover')}
								aria-label={t('music.set_cover', 'Set cover')}
								data-testid="music-set-cover-btn"
								onclick={pickCover}
							>
								{#if coverUrl(current)}
									<img
										class="absolute inset-0 h-full w-full object-cover"
										src={coverUrl(current)}
										alt=""
									/>
								{:else}
									<Icon name="music" />
								{/if}
								<div
									class="absolute inset-0 flex items-center justify-center bg-neutral/60 text-2xl text-neutral-content opacity-0 transition-opacity group-hover:opacity-100"
								>
									<Icon name="camera" />
								</div>
							</button>
							<div class="flex-1">
								<h2 class="m-0 mb-2 text-xl font-bold text-base-content md:text-3xl">
									{current.name}
								</h2>
								<p class="m-0 text-base text-base-content/60">
									{t('music.track_count', { n: current.track_count }, '{{n}} tracks')}
									{#if current.description}· {current.description}{/if}
								</p>
								{#if current.is_public}
									<span class="badge badge-info mt-2 gap-1">
										<Icon name="globe" /> <span>{t('music.public', 'Public')}</span>
									</span>
								{/if}
							</div>
						</div>

						<div class="mb-6 flex flex-wrap items-center gap-2">
							<button
								class="btn btn-sm"
								data-testid="music-play-all-btn"
								onclick={playAll}
								disabled={tracks.length === 0}
							>
								<Icon name="play" />
								<span>{t('music.play_all', 'Play all')}</span>
							</button>
							<button
								class="btn btn-square btn-sm"
								data-testid="music-shuffle-play-btn"
								onclick={shufflePlay}
								disabled={tracks.length === 0}
								title={t('music.shuffle', 'Shuffle')}
								aria-label={t('music.shuffle', 'Shuffle')}
							>
								<Icon name="shuffle" />
							</button>
							<button class="btn btn-sm" data-testid="music-add-tracks-btn" onclick={openAdd}>
								<Icon name="plus" />
								<span>{t('music.add_tracks', 'Add tracks')}</span>
							</button>
							<button
								class="btn btn-square btn-sm"
								data-testid="music-rename-playlist-btn"
								onclick={onRenamePlaylist}
								title={t('common.rename', 'Rename')}
								aria-label={t('common.rename', 'Rename')}
							>
								<Icon name="pen" />
							</button>
							<button
								class="btn btn-square btn-sm"
								data-testid="music-edit-description-btn"
								onclick={onEditDescription}
								title={t('music.edit_description', 'Edit description')}
								aria-label={t('music.edit_description', 'Edit description')}
							>
								<Icon name="pencil-alt" />
							</button>
							<button
								class="btn btn-square btn-sm"
								data-testid="music-manage-shares-btn"
								onclick={openShares}
								title={t('music.manage_shares', 'Manage shares')}
								aria-label={t('music.manage_shares', 'Manage shares')}
							>
								<Icon name="users" />
							</button>
							<button
								class="btn btn-square btn-sm {current.is_public ? 'btn-active' : ''}"
								data-testid="music-toggle-public-btn"
								onclick={onTogglePublic}
								title={current.is_public
									? t('music.make_private', 'Make private')
									: t('music.make_public', 'Make public')}
								aria-label={current.is_public
									? t('music.make_private', 'Make private')
									: t('music.make_public', 'Make public')}
							>
								<Icon name="globe" />
							</button>
							<button
								class="btn btn-square btn-sm text-error"
								data-testid="music-delete-playlist-btn"
								onclick={() => onDelete(current!)}
								title={t('common.delete', 'Delete')}
								aria-label={t('common.delete', 'Delete')}
							>
								<Icon name="trash" />
							</button>
						</div>

						<div class="overflow-hidden rounded-2xl bg-base-200">
							{#if tracks.length === 0}
								<div
									class="flex flex-col items-center justify-center px-5 py-16 text-center text-base-content/60"
								>
									<Icon name="music" class="mb-4 text-6xl text-base-content/30" />
									<p class="m-0">{t('music.empty_playlist', 'This playlist has no tracks yet.')}</p>
								</div>
							{:else}
								<div
									class="flex items-center border-b border-base-300 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/60"
								>
									<span class="w-7 shrink-0 px-2"></span>
									<span class="w-10 px-2 text-center">#</span>
									<span class="min-w-0 flex-[2] px-2">{t('music.title', 'Title')}</span>
									<span class="flex-1 px-2">{t('music.artist', 'Artist')}</span>
									<span class="hidden flex-1 px-2 md:block">{t('music.album', 'Album')}</span>
									<span class="w-[60px] px-2 text-right"><Icon name="clock" /></span>
									<span class="w-9 px-2"></span>
								</div>
								{#each tracks as track, i (track.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="group flex cursor-pointer items-center border-b border-base-300 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-base-300 {currentTrack?.id ===
											track.id && playing
											? 'text-primary'
											: ''}"
										data-testid={trackLabel(track)}
										draggable="true"
										ondblclick={() => playFromTracks(i)}
										ondragstart={() => onDragStart(i)}
										ondragover={(e) => onDragOver(e, i)}
										ondrop={onDrop}
										ondragend={() => (dragIndex = null)}
									>
										<span
											class="flex w-7 shrink-0 cursor-grab items-center justify-center px-2 text-base-content/60 opacity-0 transition-opacity group-hover:opacity-100"
											aria-hidden="true"
										>
											<Icon name="grip-vertical" />
										</span>
										<span class="w-10 px-2 text-center text-base-content/60">
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<span
												data-testid={`music-track-play-${track.id}`}
												onclick={(e) => {
													e.stopPropagation();
													if (currentTrack?.id === track.id) togglePlay();
													else playFromTracks(i);
												}}
											>
												{#if currentTrack?.id === track.id}
													<Icon name={playing ? 'pause' : 'play'} />
												{:else}
													<span>{i + 1}</span>
												{/if}
											</span>
										</span>
										<span class="flex min-w-0 flex-[2] items-center gap-3 px-2">
											<Icon name="music" class="text-base-content/60" />
											<span class="truncate font-medium">{trackLabel(track)}</span>
										</span>
										<span class="flex-1 truncate px-2 text-base-content/60"
											>{track.artist || '—'}</span
										>
										<span class="hidden flex-1 truncate px-2 text-base-content/60 md:block"
											>{track.album || '-'}</span
										>
										<span class="w-[60px] px-2 text-right tabular-nums text-base-content/60"
											>{fmtDuration(track.duration_secs)}</span
										>
										<span class="flex w-9 justify-center px-2">
											<button
												class="btn btn-ghost btn-xs opacity-0 transition-opacity group-hover:opacity-100"
												title={t('common.remove', 'Remove')}
												aria-label={t('common.remove', 'Remove')}
												data-testid={`music-track-remove-${track.id}`}
												onclick={(e) => {
													e.stopPropagation();
													onRemoveTrack(track);
												}}
											>
												<Icon name="times" />
											</button>
										</span>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				{:else}
					<div
						class="flex h-full flex-col items-center justify-center text-center text-base-content/60"
					>
						<Icon name="music" class="mb-5 text-6xl text-base-content/30" />
						<h3 class="m-0 mb-2 text-xl font-semibold text-base-content">
							{t('music.select_playlist', 'Select a playlist.')}
						</h3>
						<p class="m-0">{t('music.select_hint', 'Pick a playlist to view its tracks.')}</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Now-playing bar (persists while browsing) -->
{#if currentTrack}
	<div
		class="fixed inset-x-0 bottom-0 z-[1000] flex h-[70px] items-center gap-2 border-t border-base-300 bg-base-100 px-2 shadow-lg md:h-[90px] md:gap-4 md:px-4"
	>
		<div class="flex max-w-[120px] items-center gap-3 md:min-w-[180px] md:max-w-[240px]">
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-primary md:h-14 md:w-14 md:text-xl"
			>
				{#if coverUrl(current)}
					<img class="h-full w-full rounded-lg object-cover" src={coverUrl(current)} alt="" />
				{:else}
					<Icon name="music" />
				{/if}
			</div>
			<div class="flex min-w-0 flex-col">
				<span class="max-w-[70px] truncate text-xs font-medium md:max-w-none md:text-sm"
					>{trackLabel(currentTrack)}</span
				>
				<span
					class="max-w-[70px] truncate text-[10px] text-base-content/60 md:max-w-none md:text-xs"
					>{currentTrack.artist ?? ''}</span
				>
			</div>
		</div>

		<div class="flex min-w-0 flex-1 flex-col items-center gap-1">
			<div class="flex items-center gap-1 md:gap-2">
				<button
					class="btn btn-circle btn-ghost btn-sm {shuffle
						? 'text-primary'
						: 'text-base-content/60'}"
					title={t('music.shuffle', 'Shuffle')}
					aria-label={t('music.shuffle', 'Shuffle')}
					data-testid="music-player-shuffle-btn"
					onclick={() => (shuffle = !shuffle)}
				>
					<Icon name="shuffle" />
				</button>
				<button
					class="btn btn-circle btn-ghost btn-sm text-base-content/60"
					title={t('music.prev', 'Previous')}
					aria-label={t('music.prev', 'Previous')}
					data-testid="music-player-prev-btn"
					onclick={prev}
				>
					<Icon name="backward" />
				</button>
				<button
					class="btn btn-circle btn-primary btn-sm md:btn-md"
					title={t('music.play', 'Play')}
					aria-label={t('music.play', 'Play')}
					data-testid="music-player-play-btn"
					onclick={togglePlay}
				>
					<Icon name={playing ? 'pause' : 'play'} />
				</button>
				<button
					class="btn btn-circle btn-ghost btn-sm text-base-content/60"
					title={t('music.next', 'Next')}
					aria-label={t('music.next', 'Next')}
					data-testid="music-player-next-btn"
					onclick={next}
				>
					<Icon name="forward" />
				</button>
				<button
					class="btn btn-circle btn-ghost btn-sm relative {repeat !== 'none'
						? 'text-primary'
						: 'text-base-content/60'}"
					title={t('music.repeat', 'Repeat')}
					aria-label={t('music.repeat', 'Repeat')}
					data-testid="music-player-repeat-btn"
					onclick={cycleRepeat}
				>
					<Icon name="repeat" />
					{#if repeat === 'one'}<span
							class="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-content"
							>1</span
						>{/if}
				</button>
			</div>
			<div class="flex w-full items-center gap-2">
				<span class="text-xs tabular-nums text-base-content/60">{fmtTime(currentTime)}</span>
				<input
					class="range range-primary range-xs flex-1"
					type="range"
					min="0"
					max={duration || 0}
					value={currentTime}
					oninput={seek}
					aria-label={t('music.seek', 'Seek')}
					data-testid="music-player-seek-input"
				/>
				<span class="text-xs tabular-nums text-base-content/60">{fmtTime(duration)}</span>
			</div>
		</div>

		<div class="flex items-center gap-1 md:min-w-[140px] md:justify-end">
			<button
				class="btn btn-circle btn-ghost btn-sm {queueOpen
					? 'text-primary'
					: 'text-base-content/60'}"
				title={t('music.queue', 'Queue')}
				aria-label={t('music.queue', 'Queue')}
				data-testid="music-player-queue-toggle-btn"
				onclick={() => (queueOpen = !queueOpen)}
			>
				<Icon name="list" />
			</button>
			<button
				class="btn btn-circle btn-ghost btn-sm text-base-content/60"
				title={t('music.mute', 'Mute')}
				aria-label={t('music.mute', 'Mute')}
				data-testid="music-player-mute-btn"
				onclick={toggleMute}
			>
				<Icon name={volumeIcon} />
			</button>
			<div class="hidden w-24 md:block">
				<input
					id="player-volume-input"
					class="range range-xs w-full"
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={muted ? 0 : volume}
					oninput={setVolume}
					aria-label={t('music.volume', 'Volume')}
					data-testid="music-player-volume-input"
				/>
			</div>
		</div>
	</div>

	{#if queueOpen}
		<div
			class="fixed inset-x-2 bottom-[110px] z-[1001] flex max-h-96 flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl md:inset-x-auto md:right-4 md:w-80"
			data-testid="music-queue-panel"
		>
			<div class="flex items-center justify-between px-4 py-3">
				<h3 class="m-0 text-sm font-semibold">{t('music.queue', 'Queue')}</h3>
				<button
					class="btn btn-circle btn-ghost btn-sm"
					data-testid="music-queue-close-btn"
					onclick={() => (queueOpen = false)}
					aria-label={t('common.close', 'Close')}
				>
					<Icon name="times" />
				</button>
			</div>
			<div class="flex-1 overflow-y-auto px-2 pb-2">
				{#if queue.length === 0}
					<div
						class="flex flex-col items-center justify-center gap-2 py-8 text-center text-base-content/60"
					>
						<Icon name="music" class="text-3xl text-base-content/30" />
						<p class="m-0">{t('music.queue_empty', 'Queue is empty.')}</p>
					</div>
				{:else}
					{#each queue as qt, i (qt.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-base-200 {i ===
							currentIndex
								? 'bg-base-200 text-primary'
								: ''}"
							data-testid={trackLabel(qt)}
							onclick={() => jumpQueue(i)}
						>
							<span class="w-5 text-center text-xs text-base-content/60">{i + 1}</span>
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="truncate text-sm">{trackLabel(qt)}</span>
								<span class="truncate text-xs text-base-content/60">{qt.artist ?? ''}</span>
							</span>
							<span class="text-xs tabular-nums text-base-content/60"
								>{fmtDuration(qt.duration_secs)}</span
							>
							<button
								class="btn btn-ghost btn-xs opacity-0 transition-opacity group-hover:opacity-100"
								aria-label={t('common.remove', 'Remove')}
								data-testid={`music-queue-remove-${qt.id}`}
								onclick={(e) => {
									e.stopPropagation();
									removeFromQueue(i);
								}}
							>
								<Icon name="times" />
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
{/if}

<audio
	bind:this={audio}
	onplay={() => (playing = true)}
	onpause={() => (playing = false)}
	ontimeupdate={() => (currentTime = audio?.currentTime ?? 0)}
	onloadedmetadata={onLoadedMetadata}
	onended={onEnded}
	onerror={onAudioError}
></audio>

<input
	bind:this={coverInput}
	type="file"
	accept="image/*"
	class="hidden"
	data-testid="music-cover-input"
	onchange={onCoverChosen}
/>

{#if addOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[1002] grid place-items-center bg-neutral/60 p-4"
		data-testid="music-add-tracks-dialog"
		onclick={(e) => {
			if (e.target === e.currentTarget) addOpen = false;
		}}
	>
		<div
			class="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-base-100 shadow-xl"
		>
			<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
				<h3 class="m-0 flex items-center gap-2 text-lg font-semibold">
					<Icon name="music" />
					{t('music.add_tracks', 'Add tracks')}
				</h3>
				<button
					class="btn btn-circle btn-ghost btn-sm text-xl"
					aria-label={t('common.close', 'Close')}
					data-testid="music-add-tracks-close-btn"
					onclick={() => (addOpen = false)}>&times;</button
				>
			</div>
			<div class="flex items-center gap-2 border-b border-base-300 px-5 py-3">
				<Icon name="search" class="text-base-content/60" />
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="input input-sm w-full"
					type="text"
					placeholder={t('music.search_audio', 'Search audio files…')}
					bind:value={addQuery}
					oninput={onAddQueryInput}
					autocomplete="off"
					autofocus
					data-testid="music-add-tracks-search-input"
				/>
			</div>
			<div class="min-h-32 flex-1 overflow-y-auto p-2">
				{#if addSearching}
					<div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
						<span class="loading loading-spinner loading-sm"></span>
						{t('common.loading', 'Loading…')}
					</div>
				{:else if addResults.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 py-8 text-base-content/60">
						<Icon name="folder-open" class="text-3xl text-base-content/30" />
						{t('music.no_audio', 'No audio files found.')}
					</div>
				{:else}
					{#each addResults as f (f.id)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-base-200 {addSelected.has(
								f.id
							)
								? 'bg-primary/10'
								: ''}"
						>
							<input
								class="checkbox checkbox-sm"
								type="checkbox"
								checked={addSelected.has(f.id)}
								onchange={() => addSelected.toggle(f.id)}
								data-testid={f.name}
							/>
							<Icon name="file-audio" class="text-base-content/60" />
							<span class="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
						</label>
					{/each}
				{/if}
			</div>
			<div class="flex items-center justify-between border-t border-base-300 px-5 py-4">
				<span class="text-sm text-base-content/60">
					{t('music.selected_count', { n: addSelected.size }, '{{n}} selected')}
				</span>
				<div class="flex gap-2">
					<button
						class="btn btn-sm"
						data-testid="music-add-tracks-cancel-btn"
						onclick={() => (addOpen = false)}
					>
						{t('common.cancel', 'Cancel')}
					</button>
					<button
						class="btn btn-primary btn-sm"
						disabled={addSelected.size === 0}
						data-testid="music-add-tracks-confirm-btn"
						onclick={confirmAdd}
					>
						<Icon name="plus" />
						{t('music.add_selected', 'Add selected')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if sharesOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[1002] grid place-items-center bg-neutral/60 p-4"
		data-testid="music-shares-dialog"
		onclick={(e) => {
			if (e.target === e.currentTarget) sharesOpen = false;
		}}
	>
		<div
			class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-base-100 shadow-xl"
		>
			<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
				<h3 class="m-0 flex items-center gap-2 text-lg font-semibold">
					<Icon name="users" />
					{t('music.manage_shares', 'Manage shares')}
				</h3>
				<button
					class="btn btn-circle btn-ghost btn-sm"
					aria-label={t('common.close', 'Close')}
					data-testid="music-shares-close-btn"
					onclick={() => (sharesOpen = false)}
				>
					<Icon name="times" />
				</button>
			</div>
			<div class="flex-1 overflow-y-auto p-4">
				{#if sharesLoading}
					<div class="flex items-center justify-center py-6 text-base-content/60">
						<span class="loading loading-spinner loading-sm"></span>
					</div>
				{:else if shares.length === 0}
					<p class="m-0 py-4 text-center text-base-content/60">
						{t('music.no_shares', 'Not shared with anyone yet.')}
					</p>
				{:else}
					{#each shares as s (s.user_id)}
						<div class="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-base-200">
							<span class="flex min-w-0 flex-1 items-center gap-2 truncate"
								><Icon name="user" class="text-base-content/60" /> {s.user_id}</span
							>
							<span class="badge badge-ghost badge-sm">
								{s.can_write ? t('music.can_write', 'Can edit') : t('music.read_only', 'Read only')}
							</span>
							<button
								class="btn btn-ghost btn-xs"
								title={t('music.remove_share', 'Remove')}
								aria-label={t('music.remove_share', 'Remove')}
								data-testid={`music-share-remove-${s.user_id}`}
								onclick={() => onRemoveShare(s.user_id)}
							>
								<Icon name="times" />
							</button>
						</div>
					{/each}
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2 border-t border-base-300 px-5 py-4">
				<input
					type="text"
					class="input input-sm min-w-0 flex-1"
					placeholder={t('music.share_with_user', 'User ID or email')}
					bind:value={shareUser}
					autocomplete="off"
					data-testid="music-share-user-input"
				/>
				<label class="flex items-center gap-1 whitespace-nowrap text-sm">
					<input
						class="checkbox checkbox-sm"
						type="checkbox"
						bind:checked={shareCanWrite}
						data-testid="music-share-can-write-checkbox"
					/>
					{t('music.can_write', 'Can edit')}
				</label>
				<button
					class="btn btn-primary btn-sm"
					disabled={!shareUser.trim()}
					data-testid="music-share-add-btn"
					onclick={onAddShare}
				>
					<Icon name="plus" />
					{t('music.share', 'Share')}
				</button>
			</div>
		</div>
	</div>
{/if}
