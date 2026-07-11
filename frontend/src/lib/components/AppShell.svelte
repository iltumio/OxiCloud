<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { logout } from '$lib/api/endpoints/auth';
	import { searchFiles } from '$lib/api/endpoints/search';
	import { fileInlineUrl } from '$lib/api/endpoints/files';
	import type { FileItem, FolderItem } from '$lib/api/types';
	import { lazyComponent } from '$lib/composables/lazyComponent.svelte';
	import { avatarBucketClass } from '$lib/components/avatarColors';
	import DrivePicker from '$lib/components/DrivePicker.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { iconNameFromClass } from '$lib/utils/display';
	import { userInitials, avatarColorIndex } from '$lib/utils/avatar';
	import { i18n, LANGUAGES, setLocale, t, type Locale } from '$lib/i18n/index.svelte';
	import { apiFetch } from '$lib/api/client';
	import { session } from '$lib/stores/session.svelte';
	import { theme, type Theme } from '$lib/stores/theme.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { formatBytes } from '$lib/utils/format';

	let { children }: { children: Snippet } = $props();

	// The command palette is loaded on its first Cmd/Ctrl+K and mounted open.
	// Until then its ~400-line module stays out of the initial bundle.
	const palette = lazyComponent(() => import('$lib/components/CommandPalette.svelte'));

	interface NavLink {
		href:
			| '/files'
			| '/shared'
			| '/shared-with-me'
			| '/recent'
			| '/favorites'
			| '/photos'
			| '/music'
			| '/trash';
		label: string;
		icon: string;
		/** Stable key kept for e2e hooks and future per-section styling. */
		section: string;
		admin?: boolean;
	}

	const LINKS: NavLink[] = [
		{ href: '/files', label: t('nav.files', 'Files'), icon: 'folder', section: 'files' },
		{ href: '/shared', label: t('nav.shared', 'Shared'), icon: 'oxiexport', section: 'shared' },
		{
			href: '/shared-with-me',
			label: t('nav.shared_with_me', 'Shared with me'),
			icon: 'oxiimport',
			section: 'shared-with-me'
		},
		{ href: '/recent', label: t('nav.recent', 'Recent'), icon: 'clock', section: 'recent' },
		{
			href: '/favorites',
			label: t('nav.favorites', 'Favorites'),
			icon: 'star',
			section: 'favorites'
		},
		{ href: '/photos', label: t('nav.photos', 'Photos'), icon: 'images', section: 'photos' },
		{ href: '/music', label: t('nav.music', 'Music'), icon: 'music', section: 'music' },
		{ href: '/trash', label: t('nav.trash', 'Trash'), icon: 'trash', section: 'trash' }
	];

	const isAdmin = $derived(session.user?.role === 'admin');

	function active(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	let sidebarOpen = $state(false);
	let notifOpen = $state(false);
	let menuOpen = $state(false);
	let searchQuery = $state('');
	/** Mobile collapsible-search overlay state (expands search across the bar). */
	let searchActive = $state(false);
	let langOpen = $state(false);
	let aboutOpen = $state(false);
	let appVersion = $state('');
	let searchInputEl = $state<HTMLInputElement | null>(null);

	// Bell ring/auto-open: react to the store's bellPing token (bumped on upload
	// start etc.). Open the panel and replay the ring animation.
	let bellRinging = $state(false);
	let lastPing = 0;
	$effect(() => {
		const p = ui.bellPing;
		if (p === lastPing) return;
		lastPing = p;
		if (p === 0) return;
		notifOpen = true;
		menuOpen = false;
		bellRinging = false;
		// Force a reflow gap before re-adding so the CSS animation restarts.
		requestAnimationFrame(() => (bellRinging = true));
		setTimeout(() => (bellRinging = false), 900);
	});

	function openMobileSearch() {
		searchActive = true;
		requestAnimationFrame(() => searchInputEl?.focus());
	}

	function closeMobileSearch() {
		searchActive = false;
		clearSearch();
	}

	async function openAbout() {
		menuOpen = false;
		aboutOpen = true;
		if (!appVersion) {
			try {
				const r = await apiFetch('/api/version', { credentials: 'same-origin' });
				if (r.ok) {
					const data = (await r.json()) as { version?: string };
					if (data.version) appVersion = `v${data.version}`;
				}
			} catch {
				/* version stays blank — non-critical */
			}
		}
	}

	// Top-bar autocomplete
	type Suggestion = { kind: 'folder'; item: FolderItem } | { kind: 'file'; item: FileItem };
	let suggestions = $state<Suggestion[]>([]);
	let suggestOpen = $state(false);
	let suggestBusy = $state(false);
	let suggestTimer: ReturnType<typeof setTimeout> | null = null;

	function goToResults() {
		const q = searchQuery.trim();
		if (q) {
			suggestOpen = false;
			searchActive = false;
			goto(resolve(`/search?q=${encodeURIComponent(q)}`));
		}
	}

	function onSearch(e: SubmitEvent) {
		e.preventDefault();
		goToResults();
	}

	function onSearchInput() {
		if (suggestTimer) clearTimeout(suggestTimer);
		const q = searchQuery.trim();
		if (q.length < 2) {
			suggestions = [];
			suggestOpen = false;
			return;
		}
		suggestTimer = setTimeout(async () => {
			suggestBusy = true;
			try {
				const r = await searchFiles(q, { recursive: true, limit: 6 });
				suggestions = [
					...r.folders.slice(0, 3).map((item) => ({ kind: 'folder' as const, item })),
					...r.files.slice(0, 6).map((item) => ({ kind: 'file' as const, item }))
				];
				suggestOpen = suggestions.length > 0;
			} catch {
				suggestions = [];
				suggestOpen = false;
			} finally {
				suggestBusy = false;
			}
		}, 250);
	}

	function clearSearch() {
		searchQuery = '';
		suggestions = [];
		suggestOpen = false;
	}

	function pickSuggestion(s: Suggestion) {
		suggestOpen = false;
		if (s.kind === 'folder') goto(resolve(`/files/${s.item.id}`));
		else window.open(fileInlineUrl(s.item.id), '_blank', 'noopener');
	}

	const THEMES: { mode: Theme; icon: string; label: string }[] = [
		{ mode: 'light', icon: 'sun', label: t('user_menu.theme.light', 'Light') },
		{ mode: 'auto', icon: 'desktop', label: t('user_menu.theme.auto', 'Like OS') },
		{ mode: 'dark', icon: 'moon', label: t('user_menu.theme.dark', 'Dark') }
	];

	const storagePct = $derived(
		session.user && session.user.storage_quota_bytes > 0
			? Math.min(100, (session.user.storage_used_bytes / session.user.storage_quota_bytes) * 100)
			: 0
	);

	const initials = $derived(userInitials(session.user?.username || session.user?.email));

	/** Uploaded avatar photo URL, if any. */
	const avatarPhoto = $derived(session.user?.image ?? null);

	/** Deterministic colour bucket 0–4 from the user id (shared with UserVignette). */
	const avatarColor = $derived(avatarColorIndex(session.user?.id));

	function closeMenus() {
		notifOpen = false;
		menuOpen = false;
		langOpen = false;
	}

	async function chooseLocale(loc: Locale) {
		langOpen = false;
		await setLocale(loc);
	}

	const currentLang = $derived(LANGUAGES.find((l) => l.code === i18n.locale) ?? LANGUAGES[0]);

	function formatTime(ms: number): string {
		return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	function notifIcon(kind: string): string {
		switch (kind) {
			case 'success':
				return 'check';
			case 'error':
				return 'exclamation-circle';
			case 'warning':
				return 'exclamation-triangle';
			default:
				return 'info-circle';
		}
	}

	const NOTIF_ICON_COLOR: Record<string, string> = {
		success: 'text-success',
		error: 'text-error',
		warning: 'text-warning',
		info: 'text-info'
	};

	async function onLogout() {
		try {
			await logout();
		} catch {
			/* clear locally regardless */
		}
		session.reset();
		await goto(resolve('/login'));
	}
</script>

<svelte:window
	onclick={closeMenus}
	onkeydown={(e) => {
		// First Cmd/Ctrl+K loads the palette and mounts it open; once mounted,
		// the palette's own handler takes over toggling/closing.
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !palette.component) {
			e.preventDefault();
			void palette.load();
			return;
		}
		if (e.key !== 'Escape') return;
		if (aboutOpen) aboutOpen = false;
		else if (searchActive) closeMobileSearch();
		else closeMenus();
	}}
/>

<div class="drawer h-dvh md:drawer-open">
	<input
		id="appshell-drawer"
		type="checkbox"
		class="drawer-toggle"
		bind:checked={sidebarOpen}
		aria-hidden="true"
		tabindex="-1"
	/>

	<div class="drawer-content flex h-full min-w-0 flex-col overflow-hidden">
		<!-- Top bar -->
		<div
			class="flex h-[70px] shrink-0 items-center gap-3 border-b border-base-300 bg-base-100 px-4 md:px-6"
		>
			<button
				class="btn btn-square btn-ghost md:hidden {searchActive ? 'hidden' : ''}"
				aria-label={t('nav.toggle', 'Toggle navigation menu')}
				aria-expanded={sidebarOpen}
				data-testid="appshell-sidebar-toggle-btn"
				onclick={() => (sidebarOpen = !sidebarOpen)}
			>
				<Icon name="bars" class="text-xl" />
			</button>

			<!-- Mobile: icon-only button that expands the full-width search overlay. -->
			<button
				class="btn btn-square btn-ghost ms-auto md:hidden {searchActive ? 'hidden' : ''}"
				id="search-toggle-btn"
				aria-label={t('actions.search_btn', 'Search')}
				data-testid="appshell-search-toggle-btn"
				onclick={openMobileSearch}
			>
				<Icon name="search" class="text-lg" />
			</button>

			<!-- Mobile: back arrow shown while the search overlay is expanded. -->
			<button
				class="btn btn-square btn-ghost md:hidden {searchActive ? '' : 'hidden'}"
				aria-label={t('common.close', 'Close')}
				data-testid="appshell-search-back-btn"
				onclick={closeMobileSearch}
			>
				<Icon name="arrow-left" class="text-lg" />
			</button>

			<div
				class="relative flex-1 items-center {searchActive
					? 'flex'
					: 'hidden md:me-5 md:flex md:max-w-[600px]'}"
			>
				<form class="relative flex flex-1 items-center" onsubmit={onSearch}>
					<Icon
						name="search"
						class="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-base-content/40 {searchActive
							? 'hidden md:block'
							: ''}"
					/>
					<input
						type="text"
						class="input h-[46px] w-full rounded-2xl pe-[52px] text-base focus:outline-none {searchActive
							? 'ps-4 md:ps-11'
							: 'ps-11'}"
						bind:this={searchInputEl}
						bind:value={searchQuery}
						data-testid="appshell-search-input"
						oninput={onSearchInput}
						onfocus={() => (suggestOpen = suggestions.length > 0)}
						onblur={() => setTimeout(() => (suggestOpen = false), 150)}
						placeholder={t('actions.search', 'Search files, folders...')}
						autocomplete="off"
					/>
					{#if searchQuery}
						<button
							class="absolute end-11 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-base-content/60 hover:bg-base-200 hover:text-base-content"
							type="button"
							title={t('common.clear', 'Clear')}
							aria-label={t('common.clear', 'Clear')}
							data-testid="appshell-search-clear-btn"
							onclick={clearSearch}
						>
							<Icon name="times" />
						</button>
					{/if}
					<button
						class="btn btn-circle btn-primary btn-sm absolute end-1.5 top-1/2 -translate-y-1/2 shadow-md"
						type="submit"
						title={t('actions.search_btn', 'Search')}
						aria-label={t('actions.search_btn', 'Search')}
						data-testid="appshell-search-submit-btn"
					>
						<Icon name="search" />
					</button>

					{#if suggestOpen}
						<ul
							class="absolute inset-x-0 top-full z-50 m-0 mt-1 max-h-96 list-none overflow-auto rounded-xl border border-base-300 bg-base-100 p-1 shadow-lg"
						>
							{#each suggestions as s (s.kind + s.item.id)}
								<li>
									<button
										class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-start hover:bg-base-200"
										type="button"
										data-testid={`appshell-search-suggestion-${s.kind}-${s.item.id}-item`}
										onmousedown={() => pickSuggestion(s)}
									>
										<span class="text-base-content/60">
											{#if s.kind === 'folder'}
												<Icon name="folder" />
											{:else}
												<Icon name={iconNameFromClass(s.item.icon_class)} />
											{/if}
										</span>
										<span class="min-w-0 flex-1 truncate">{s.item.name}</span>
									</button>
								</li>
							{/each}
							<li>
								<button
									class="mt-1 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border-t border-base-300 px-2.5 py-2 text-primary hover:bg-base-200"
									type="button"
									data-testid="appshell-search-see-all-btn"
									onmousedown={goToResults}
								>
									{t('search.see_all', 'See all results')}
								</button>
							</li>
						</ul>
					{:else if suggestBusy}
						<ul
							class="absolute inset-x-0 top-full z-50 m-0 mt-1 list-none rounded-xl border border-base-300 bg-base-100 p-1 shadow-lg"
						>
							<li class="p-2.5 text-center text-base-content/60">
								{t('common.loading', 'Loading…')}
							</li>
						</ul>
					{/if}
				</form>
			</div>

			<div class="ms-auto items-center gap-3 {searchActive ? 'hidden md:flex' : 'flex'}">
				<!-- Notifications -->
				<div class="relative" data-testid="appshell-notif-menu">
					<button
						class="btn btn-circle btn-ghost relative {notifOpen ? 'btn-active' : ''} {bellRinging
							? 'bell-ring'
							: ''}"
						aria-label={t('notifications.title', 'Notifications')}
						aria-haspopup="true"
						data-testid="appshell-notif-bell-btn"
						onclick={(e) => {
							e.stopPropagation();
							notifOpen = !notifOpen;
							menuOpen = false;
							if (notifOpen) ui.markNotificationsRead();
						}}
					>
						<Icon name="bell" class="text-lg" />
						{#if ui.unread > 0}
							<span class="badge badge-error badge-xs absolute -end-0.5 -top-0.5 px-1 font-semibold"
								>{ui.unreadBadge}</span
							>
						{/if}
					</button>
					{#if notifOpen}
						<div
							class="absolute end-0 top-full z-50 mt-2 flex max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg"
						>
							<div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
								<span class="text-sm font-semibold"
									>{t('notifications.title', 'Notifications')}</span
								>
								{#if ui.notifications.length > 0}
									<button
										class="btn btn-circle btn-ghost btn-xs text-base-content/60"
										title={t('notifications.clear', 'Clear all')}
										aria-label={t('notifications.clear', 'Clear all')}
										data-testid="appshell-notif-clear-btn"
										onclick={(e) => {
											e.stopPropagation();
											ui.clearNotifications();
										}}
									>
										<Icon name="trash-alt" />
									</button>
								{/if}
							</div>
							<div class="overflow-y-auto p-2">
								{#if ui.notifications.length === 0}
									<div
										class="flex flex-col items-center gap-2 p-6 text-center text-base-content/60"
									>
										<Icon name="bell-slash" class="text-2xl" />
										<span>{t('notifications.empty', 'No notifications')}</span>
									</div>
								{:else}
									{#each ui.notifications as n (n.id)}
										<div class="flex gap-3 rounded-lg p-2.5">
											<span class="mt-0.5 shrink-0 {NOTIF_ICON_COLOR[n.kind] ?? 'text-info'}">
												<Icon name={n.icon ?? notifIcon(n.kind)} />
											</span>
											<div class="min-w-0 flex-1">
												<div class="text-sm">{n.message}</div>
												{#if n.currentFile}
													<div
														class="mt-0.5 truncate text-xs text-base-content/60"
														title={n.currentFile}
													>
														{n.currentFile}
													</div>
												{/if}
												{#if n.progress !== undefined}
													<div
														class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-300"
														role="progressbar"
														aria-valuenow={n.progress}
														aria-valuemin="0"
														aria-valuemax="100"
													>
														<div
															class="h-full bg-primary transition-[width] duration-200"
															style:width="{n.progress}%"
														></div>
													</div>
													<div class="mt-1 flex justify-between gap-2 text-xs text-base-content/60">
														<span>{n.progress}%</span>
														{#if n.total !== undefined}
															<span>
																{t(
																	'upload.files_counter',
																	{ done: n.completed ?? 0, total: n.total },
																	`${n.completed ?? 0} / ${n.total} files`
																)}
															</span>
														{/if}
													</div>
												{:else}
													<div class="mt-0.5 text-xs text-base-content/60">{formatTime(n.at)}</div>
												{/if}
											</div>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- User menu -->
				<div class="relative" data-testid="appshell-user-menu">
					<button
						class="btn btn-circle btn-ghost"
						aria-label={t('user_menu.title', 'User menu')}
						aria-haspopup="true"
						data-testid="appshell-user-menu-btn"
						onclick={(e) => {
							e.stopPropagation();
							menuOpen = !menuOpen;
							notifOpen = false;
						}}
					>
						{@render avatar(false)}
					</button>

					{#if menuOpen}
						<div
							class="absolute end-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-base-300 bg-base-100 py-2 shadow-lg"
						>
							{#if session.user}
								<div class="flex items-center gap-3 px-4 py-3">
									{@render avatar(true)}
									<div class="min-w-0">
										<div class="truncate font-semibold">
											{session.user.username || session.user.email}
										</div>
										<div class="truncate text-sm text-base-content/60">{session.user.email}</div>
									</div>
								</div>

								{#if isAdmin}
									<div class="px-4 pb-2">
										<span class="badge badge-outline badge-primary gap-1">
											<Icon name="shield-alt" />
											{t('user_menu.admin', 'Admin')}
										</span>
									</div>
								{/if}

								<div class="px-4 py-2">
									<div class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
										<Icon name="database" /> <span>{t('storage.title', 'Storage')}</span>
									</div>
									<div class="mb-1.5 h-1.5 overflow-hidden rounded-full bg-base-300">
										<div
											class="h-full rounded-full bg-primary transition-[width] duration-700"
											style:width="{storagePct}%"
										></div>
									</div>
									<div class="text-xs text-base-content/60">
										{#if session.user.storage_quota_bytes > 0}
											{t(
												'storage.used',
												{
													percentage: Math.round(storagePct),
													used: formatBytes(session.user.storage_used_bytes),
													total: formatBytes(session.user.storage_quota_bytes)
												},
												'{{percentage}}% used ({{used}} / {{total}})'
											)}
										{:else}
											{formatBytes(session.user.storage_used_bytes)}
										{/if}
									</div>
								</div>
							{/if}

							<div class="my-1 border-t border-base-300"></div>

							{#if isAdmin}
								<a
									class="flex w-full items-center gap-3 px-4 py-2.5 text-sm no-underline hover:bg-base-200"
									href={resolve('/admin')}
									data-testid="appshell-user-menu-admin-item"
									onclick={() => (menuOpen = false)}
								>
									<Icon name="cogs" /> <span>{t('user_menu.admin_panel', 'Admin panel')}</span>
								</a>
								<a
									class="flex w-full items-center gap-3 px-4 py-2.5 text-sm no-underline hover:bg-base-200"
									href={resolve('/groups')}
									data-testid="appshell-user-menu-groups-item"
									onclick={() => (menuOpen = false)}
								>
									<Icon name="user-group" />
									<span>{t('user_menu.manage_groups', 'Manage groups')}</span>
								</a>
							{/if}
							<a
								class="flex w-full items-center gap-3 px-4 py-2.5 text-sm no-underline hover:bg-base-200"
								href={resolve('/profile')}
								data-testid="appshell-user-menu-profile-item"
								onclick={() => (menuOpen = false)}
							>
								<Icon name="user-circle" /> <span>{t('user_menu.profile', 'My profile')}</span>
							</a>

							<div class="my-1 border-t border-base-300"></div>

							<div class="flex w-full cursor-default items-center gap-3 px-4 py-2.5 text-sm">
								<Icon name="globe" />
								<span>{t('settings.language', 'Language')}</span>
								<div class="relative ms-auto" data-testid="appshell-lang-menu">
									<button
										type="button"
										class="btn btn-ghost btn-xs gap-1 border border-base-300 font-semibold"
										aria-haspopup="listbox"
										aria-expanded={langOpen}
										data-testid="appshell-lang-toggle-btn"
										onclick={(e) => {
											e.stopPropagation();
											langOpen = !langOpen;
										}}
									>
										<span>{(currentLang.code as string).toUpperCase()}</span>
										<Icon
											name="chevron-down"
											class="text-[0.7rem] transition-transform {langOpen ? 'rotate-180' : ''}"
										/>
									</button>
									{#if langOpen}
										<ul
											class="absolute bottom-full end-0 z-[60] m-0 mb-1 max-h-72 min-w-48 list-none overflow-auto rounded-xl border border-base-300 bg-base-100 p-1 shadow-lg"
											role="listbox"
										>
											{#each LANGUAGES as lang (lang.code)}
												<li>
													<button
														type="button"
														class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-base-200 {lang.code ===
														i18n.locale
															? 'font-semibold text-primary'
															: ''}"
														role="option"
														aria-selected={lang.code === i18n.locale}
														data-testid={`appshell-lang-${lang.code}-option`}
														onclick={(e) => {
															e.stopPropagation();
															chooseLocale(lang.code);
														}}
													>
														<span>{lang.flag}</span>
														<span class="min-w-0 flex-1 truncate">{lang.name}</span>
														{#if lang.code === i18n.locale}
															<Icon name="check" class="shrink-0 text-primary" />
														{/if}
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							</div>

							<div class="flex w-full cursor-default items-center gap-3 px-4 py-2.5 text-sm">
								<Icon name="adjust" />
								<span>{t('user_menu.appearance', 'Appearance')}</span>
								<div
									class="join ms-auto"
									role="radiogroup"
									aria-label={t('user_menu.appearance', 'Appearance')}
									data-testid="appshell-theme-toggle"
								>
									{#each THEMES as th (th.mode)}
										<button
											type="button"
											class="btn join-item btn-xs {theme.current === th.mode
												? 'btn-primary'
												: 'btn-ghost border border-base-300'}"
											role="radio"
											aria-checked={theme.current === th.mode}
											title={th.label}
											aria-label={th.label}
											data-testid={`appshell-theme-${th.mode}-option`}
											onclick={(e) => {
												e.stopPropagation();
												theme.set(th.mode);
											}}
										>
											<Icon name={th.icon} />
										</button>
									{/each}
								</div>
							</div>

							<button
								class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-base-200"
								data-testid="appshell-user-menu-about-item"
								onclick={openAbout}
							>
								<Icon name="info-circle" /> <span>{t('user_menu.about', 'About OxiCloud')}</span>
							</button>

							<div class="my-1 border-t border-base-300"></div>

							<button
								class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start text-sm text-error hover:bg-error/10"
								data-testid="appshell-user-menu-logout-btn"
								onclick={onLogout}
							>
								<Icon name="sign-out-alt" /> <span>{t('actions.logout', 'Log out')}</span>
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex-1 overflow-auto">
			{@render children()}
		</div>
	</div>

	<!-- Sidebar (daisyUI drawer: off-canvas below md, static from md up) -->
	<div class="drawer-side z-[999]">
		<label
			for="appshell-drawer"
			class="drawer-overlay"
			aria-label={t('nav.toggle', 'Toggle navigation menu')}
		></label>
		<aside class="flex h-full w-64 flex-col bg-base-200">
			<a
				href={resolve('/files')}
				class="flex items-center gap-3 border-b border-base-300 px-5 py-5 no-underline"
				data-testid="appshell-logo-link"
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary shadow-md transition-transform hover:scale-105"
				>
					<!-- 25px (not 22) so the cloud keeps its rendered scale after the
					     viewBox grew 280→320 to stop clipping its left bulge. -->
					<svg
						viewBox="95 67 320 320"
						aria-hidden="true"
						class="h-[25px] w-[25px] fill-primary-content"
					>
						<path
							d="M345 310c32 0 58-26 58-58s-26-58-58-58c-6.2 0-12 0.9-17.5 2.7C318 166 289 143 255 143c-34.3 0-63.1 22.6-73 53.7C176.9 195.7 171 195 165 195c-32 0-58 26-58 58s26 58 58 58h180z"
						/>
					</svg>
				</div>
				<div class="text-lg font-bold tracking-wide">OxiCloud</div>
			</a>

			<nav
				class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
				aria-label={t('nav.primary', 'Primary')}
			>
				{#each LINKS as link (link.href)}
					<a
						class="flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm no-underline transition-colors {active(
							link.href
						)
							? 'bg-primary/10 font-semibold'
							: 'font-medium text-base-content/70 hover:bg-base-content/10 hover:text-base-content'}"
						href={resolve(link.href)}
						data-section={link.section}
						data-testid={`appshell-nav-${link.href.replace(/^\//, '')}-link`}
						onclick={() => (sidebarOpen = false)}
					>
						<Icon
							name={link.icon}
							class="h-5 w-5 shrink-0 {active(link.href) ? 'text-primary' : ''}"
						/>
						<span>{link.label}</span>
					</a>
					{#if link.href === '/files' && !session.isExternalUser}
						<DrivePicker onnavigate={() => (sidebarOpen = false)} />
					{/if}
				{/each}
			</nav>

			{#if session.user}
				<div class="mx-3 mb-4 mt-auto rounded-2xl border border-base-300 bg-base-100 p-4">
					<div class="mb-3 flex items-center justify-center gap-1.5 text-sm font-semibold">
						<Icon name="database" /> <span>{t('storage.title', 'Storage')}</span>
					</div>
					<div class="mb-2.5 h-1.5 overflow-hidden rounded-full bg-base-300">
						<div
							class="h-full rounded-full bg-primary transition-[width] duration-700"
							style:width="{storagePct}%"
						></div>
					</div>
					<div class="text-center text-xs text-base-content/60">
						{#if session.user.storage_quota_bytes > 0}
							{Math.round(storagePct)}% · {formatBytes(session.user.storage_used_bytes)} / {formatBytes(
								session.user.storage_quota_bytes
							)}
						{:else}
							{formatBytes(session.user.storage_used_bytes)}
						{/if}
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>

{#snippet avatar(large: boolean)}
	{#if avatarPhoto}
		<img
			class="rounded-full object-cover {large ? 'h-11 w-11' : 'h-9 w-9'}"
			src={avatarPhoto}
			alt={t('user_menu.title', 'User menu')}
		/>
	{:else}
		<span
			class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold {large
				? 'h-11 w-11 text-base'
				: 'h-9 w-9 text-sm'} {avatarBucketClass(avatarColor)}">{initials}</span
		>
	{/if}
{/snippet}

{#if aboutOpen}
	<!-- About OxiCloud modal -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal modal-open"
		onclick={(e) => e.target === e.currentTarget && (aboutOpen = false)}
	>
		<div
			class="modal-box flex max-w-[min(92vw,26rem)] flex-col items-center gap-3 px-5 py-6 text-center"
			role="dialog"
			aria-modal="true"
			aria-labelledby="about-modal-title"
		>
			<div class="h-[73px] w-[73px] text-primary">
				<svg viewBox="95 67 320 320" aria-hidden="true" class="h-full w-full fill-current">
					<path
						d="M345 310c32 0 58-26 58-58s-26-58-58-58c-6.2 0-12 0.9-17.5 2.7C318 166 289 143 255 143c-34.3 0-63.1 22.6-73 53.7C176.9 195.7 171 195 165 195c-32 0-58 26-58 58s26 58 58 58h180z"
					/>
				</svg>
			</div>
			<h2 id="about-modal-title" class="m-0 text-2xl font-semibold">OxiCloud</h2>
			<div class="text-sm text-base-content/60">{appVersion || 'v…'}</div>
			<p class="m-0 text-sm leading-relaxed text-base-content/60">
				{t(
					'user_menu.about_description',
					'Cloud storage platform built with Rust & Clean Architecture. Fast, secure, and private.'
				)}
			</p>
			<div class="flex flex-wrap justify-center gap-2">
				<span class="badge badge-ghost">Rust</span>
				<span class="badge badge-ghost">Axum</span>
				<span class="badge badge-ghost">PostgreSQL</span>
				<span class="badge badge-ghost">Clean Architecture</span>
			</div>
			<div class="flex gap-4">
				<a
					class="inline-flex items-center gap-1 text-sm text-primary no-underline hover:underline"
					href="https://github.com/AtalayaLabs/OxiCloud/"
					target="_blank"
					rel="noopener"
					data-testid="appshell-about-github-link"
				>
					<Icon name="github" /> GitHub
				</a>
				<a
					class="inline-flex items-center gap-1 text-sm text-primary no-underline hover:underline"
					href="https://github.com/AtalayaLabs/OxiCloud/blob/main/LICENSE"
					target="_blank"
					rel="noopener"
					data-testid="appshell-about-license-link"
				>
					<Icon name="file-alt" />
					{t('user_menu.mit_license', 'MIT License')}
				</a>
			</div>
			<button
				class="btn btn-sm mt-2"
				data-testid="appshell-about-close-btn"
				onclick={() => (aboutOpen = false)}
			>
				{t('actions.close', 'Close')}
			</button>
		</div>
	</div>
{/if}

{#if palette.component}
	{@const CommandPalette = palette.component}
	<CommandPalette autoOpen />
{/if}

<style>
	/* Bell "ring" animation, replayed when bellRinging toggles on — keyframes
	   can't be expressed as utilities, so this is the one scoped-CSS holdout. */
	.bell-ring :global(svg) {
		transform-origin: top center;
		animation: bell-ring 0.9s ease;
	}

	@keyframes bell-ring {
		0%,
		100% {
			transform: rotate(0);
		}

		10%,
		30%,
		50% {
			transform: rotate(12deg);
		}

		20%,
		40%,
		60% {
			transform: rotate(-12deg);
		}

		70% {
			transform: rotate(6deg);
		}

		80% {
			transform: rotate(-6deg);
		}
	}
</style>
