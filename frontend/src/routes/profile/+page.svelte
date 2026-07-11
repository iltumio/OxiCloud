<script lang="ts">
	import { errorToast } from '$lib/utils/errors';
	import { relativeTimeAgo } from '$lib/utils/time';
	import { onMount } from 'svelte';
	import {
		changePassword,
		createAppPassword,
		isAutoAppPassword,
		listAppPasswords,
		revokeAppPassword,
		updateAvatar,
		updateProfile,
		type AppPassword,
		type ProfilePatch
	} from '$lib/api/endpoints/profile';
	import { getOidcProviders } from '$lib/api/endpoints/auth';
	import { SUPPORTED_LOCALES, setLocale, t, type Locale } from '$lib/i18n/index.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { confirmDialog } from '$lib/stores/dialogs.svelte';
	import { session } from '$lib/stores/session.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { formatBytes } from '$lib/utils/format';
	import { formatDate } from '$lib/utils/display';
	import { resizeImageToDataUrl } from '$lib/utils/imageResize';

	let givenName = $state('');
	let familyName = $state('');
	let username = $state('');
	let preferredLocale = $state<string>('');
	let notifyOnShare = $state(true);

	let currentPw = $state('');
	let newPw = $state('');
	let confirmPw = $state('');

	let savingProfile = $state(false);
	let savingPassword = $state(false);

	let avatarBusy = $state(false);
	let passwordLoginEnabled = $state(true);

	// Avatar edit panel.
	let avatarEditOpen = $state(false);
	let avatarTab = $state<'url' | 'upload'>('url');
	let avatarUrl = $state('');
	let avatarPreview = $state<string | null>(null);
	let uploadedDataUrl = $state<string | null>(null);
	let avatarImgFailed = $state(false);

	let appPasswords = $state<AppPassword[]>([]);
	let appPwLoadFailed = $state(false);
	let generated = $state<{ label: string; password: string } | null>(null);
	let newLabel = $state('');
	let creatingPw = $state(false);
	let autoExpanded = $state(false);

	const isOidc = $derived(!!session.user?.auth_provider && session.user.auth_provider !== 'local');
	const isLocal = $derived(!isOidc);
	const usernameClaimed = $derived(!!session.user?.username);
	const isAdmin = $derived(session.user?.role === 'admin');
	const canEditImage = $derived(session.user?.can_edit_image === true && isLocal);
	const showPasswordCard = $derived(isLocal && passwordLoginEnabled);

	const storagePct = $derived(
		session.user && session.user.storage_quota_bytes > 0
			? Math.min(
					100,
					Math.round((session.user.storage_used_bytes / session.user.storage_quota_bytes) * 100)
				)
			: 0
	);
	const storageBarClass = $derived(
		storagePct > 90 ? 'progress-error' : storagePct > 70 ? 'progress-warning' : 'progress-success'
	);
	const initials = $derived(
		(session.user?.username || session.user?.email || '?').slice(0, 2).toUpperCase()
	);

	const userPasswords = $derived(appPasswords.filter((p) => !isAutoAppPassword(p)));
	const autoPasswords = $derived(appPasswords.filter((p) => isAutoAppPassword(p)));

	/** Relative time (e.g. "3 days ago"); "Never" when absent. */
	const timeAgo = (value: string | null | undefined): string =>
		relativeTimeAgo(value, { empty: t('profile.never', 'Never'), invalidAsString: true });

	function hydrate() {
		const u = session.user;
		if (!u) return;
		givenName = u.given_name ?? '';
		familyName = u.family_name ?? '';
		username = u.username ?? '';
		preferredLocale = u.preferred_locale ?? '';
		notifyOnShare = u.notify_on_share;
	}

	async function saveProfile(e: SubmitEvent) {
		e.preventDefault();
		const u = session.user;
		if (!u) return;

		// Build a sparse patch of only the fields the user actually changed.
		// Sending empty strings the user never touched would 400 on the server.
		const patch: ProfilePatch = {};
		if (!usernameClaimed && username.trim() && username.trim() !== (u.username ?? '')) {
			patch.username = username.trim();
		}
		if (givenName.trim() !== (u.given_name ?? '')) patch.given_name = givenName.trim();
		if (familyName.trim() !== (u.family_name ?? '')) patch.family_name = familyName.trim();
		if ((preferredLocale || '') !== (u.preferred_locale ?? '')) {
			patch.preferred_locale = preferredLocale || undefined;
		}
		if (notifyOnShare !== u.notify_on_share) patch.notify_on_share = notifyOnShare;

		if (Object.keys(patch).length === 0) {
			ui.notify(t('profile.profile_no_changes', 'No changes to save.'), 'info');
			return;
		}

		savingProfile = true;
		try {
			const updated = await updateProfile(patch);
			session.user = updated;
			if (patch.preferred_locale) await setLocale(patch.preferred_locale as Locale);
			ui.notify(t('profile.saved', 'Profile saved'), 'success');
		} catch (err) {
			errorToast(err);
		} finally {
			savingProfile = false;
		}
	}

	async function savePassword(e: SubmitEvent) {
		e.preventDefault();
		if (newPw !== confirmPw) {
			ui.notify(t('profile.password_mismatch', 'Passwords do not match'), 'error');
			return;
		}
		if (newPw.length < 8) {
			ui.notify(
				t('profile.password_too_short', 'Password must be at least 8 characters.'),
				'error'
			);
			return;
		}
		savingPassword = true;
		try {
			await changePassword(currentPw, newPw);
			currentPw = newPw = confirmPw = '';
			ui.notify(t('profile.password_updated', 'Password updated'), 'success');
		} catch (err) {
			errorToast(err);
		} finally {
			savingPassword = false;
		}
	}

	// ── Avatar edit panel ──────────────────────────────────────────────────
	function openAvatarEdit() {
		avatarEditOpen = true;
		avatarTab = 'url';
		avatarUrl = '';
		avatarPreview = null;
		uploadedDataUrl = null;
	}

	function closeAvatarEdit() {
		avatarEditOpen = false;
		uploadedDataUrl = null;
		avatarPreview = null;
	}

	async function onAvatarFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const dataUrl = await resizeImageToDataUrl(file);
			uploadedDataUrl = dataUrl;
			avatarPreview = dataUrl;
		} catch (err) {
			uploadedDataUrl = null;
			avatarPreview = null;
			errorToast(err);
		} finally {
			input.value = '';
		}
	}

	async function commitAvatar(image: string | null) {
		avatarBusy = true;
		try {
			await updateAvatar(image);
			if (session.user) session.user = { ...session.user, image };
			avatarImgFailed = false;
			closeAvatarEdit();
		} catch (err) {
			errorToast(err);
		} finally {
			avatarBusy = false;
		}
	}

	async function saveAvatar() {
		if (avatarTab === 'url') {
			await commitAvatar(avatarUrl.trim() || null);
		} else {
			if (!uploadedDataUrl) {
				ui.notify(t('profile.photo_no_file', 'Choose a photo first.'), 'error');
				return;
			}
			await commitAvatar(uploadedDataUrl);
		}
	}

	// ── App passwords ──────────────────────────────────────────────────────
	async function loadAppPasswords() {
		try {
			appPasswords = await listAppPasswords();
			appPwLoadFailed = false;
		} catch {
			appPwLoadFailed = true;
		}
	}

	async function createPw() {
		const label = newLabel.trim();
		if (!label) {
			ui.notify(t('profile.error_label_required', 'Enter a label.'), 'error');
			return;
		}
		creatingPw = true;
		try {
			const password = await createAppPassword(label);
			generated = { label, password };
			newLabel = '';
			await loadAppPasswords();
		} catch (err) {
			errorToast(err);
		} finally {
			creatingPw = false;
		}
	}

	async function revokePw(p: AppPassword) {
		const ok = await confirmDialog({
			title: t('profile.app_pw_revoke', 'Revoke app password'),
			message: t('profile.confirm_revoke', { label: p.label }, 'Revoke "{{label}}"?'),
			confirmText: t('profile.app_pw_revoke', 'Revoke'),
			danger: true
		});
		if (!ok) return;
		try {
			await revokeAppPassword(p.id);
			generated = null;
			await loadAppPasswords();
		} catch (err) {
			errorToast(err);
		}
	}

	async function copyGenerated() {
		if (!generated) return;
		try {
			await navigator.clipboard.writeText(generated.password);
			ui.notify(t('profile.copied', 'Copied'), 'success');
		} catch {
			ui.notify(t('profile.copy_failed', 'Could not copy'), 'error');
		}
	}

	onMount(async () => {
		if (!session.loaded) await session.load();
		hydrate();
		void loadAppPasswords();
		try {
			const providers = await getOidcProviders();
			// Only an explicit `false` hides the password card; an absent flag
			// (no OIDC configured) leaves password login available.
			if (providers.password_login_enabled === false) passwordLoginEnabled = false;
		} catch {
			/* leave password login enabled */
		}
	});
</script>

<svelte:head><title>{t('nav.profile', 'Profile')} · OxiCloud</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
	<h1 class="text-2xl font-bold">{t('nav.profile', 'Profile')}</h1>

	{#if session.user}
		<!-- Avatar / identity -->
		<div class="card border border-base-300 bg-base-100">
			<div class="card-body gap-3">
				<div class="flex items-center gap-5">
					{#if session.user.image && !avatarImgFailed}
						<div class="avatar">
							<div class="w-18 rounded-full">
								<img
									src={session.user.image}
									alt={initials}
									onerror={() => (avatarImgFailed = true)}
								/>
							</div>
						</div>
					{:else}
						<div class="avatar avatar-placeholder">
							<div class="w-18 rounded-full bg-primary text-primary-content">
								<span class="text-2xl font-bold">{initials}</span>
							</div>
						</div>
					{/if}
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<h2 class="truncate text-xl font-bold">
							{session.user.username || session.user.email || '—'}
						</h2>
						<div class="text-sm text-base-content/60">{session.user.email}</div>
						<span class="badge gap-1.5 {isAdmin ? 'badge-warning badge-soft' : 'badge-ghost'}">
							<Icon name={isAdmin ? 'shield-alt' : 'user'} />
							{isAdmin ? t('profile.role_admin', 'Administrator') : t('profile.role_user', 'User')}
						</span>
						{#if isOidc && session.user.image}
							<p class="text-sm text-base-content/60">
								{t('profile.photo_managed_by_oidc', 'Photo managed by your identity provider.')}
							</p>
						{/if}
					</div>
					{#if canEditImage}
						<button
							class="btn btn-ghost btn-square self-start"
							data-testid="profile-avatar-edit-btn"
							title={t('profile.edit_photo', 'Edit photo')}
							onclick={openAvatarEdit}
						>
							<Icon name="pencil-alt" />
						</button>
					{/if}
				</div>

				{#if canEditImage && avatarEditOpen}
					<div
						class="flex flex-col gap-3 border-t border-base-300 pt-4"
						data-testid="profile-avatar-edit-panel"
					>
						<div class="tabs-box tabs w-fit" role="tablist">
							<button
								class="tab {avatarTab === 'url' ? 'tab-active' : ''}"
								role="tab"
								aria-selected={avatarTab === 'url'}
								data-testid="profile-avatar-url-tab"
								onclick={() => (avatarTab = 'url')}
							>
								{t('profile.photo_tab_url', 'URL')}
							</button>
							<button
								class="tab {avatarTab === 'upload' ? 'tab-active' : ''}"
								role="tab"
								aria-selected={avatarTab === 'upload'}
								data-testid="profile-avatar-upload-tab"
								onclick={() => (avatarTab = 'upload')}
							>
								{t('profile.photo_tab_upload', 'Upload')}
							</button>
						</div>

						{#if avatarTab === 'url'}
							<input
								type="url"
								class="input w-full"
								data-testid="profile-avatar-url-input"
								bind:value={avatarUrl}
								placeholder="https://example.com/photo.jpg"
							/>
							<small class="text-sm text-base-content/60">
								{t(
									'profile.photo_url_hint',
									'https://, http://, or data:image/…;base64,… accepted'
								)}
							</small>
						{:else}
							<label class="btn btn-outline w-fit gap-2">
								<Icon name="user-plus" />
								<span>{t('profile.photo_choose_file', 'Choose a photo (PNG, JPEG, WebP)')}</span>
								<input
									type="file"
									data-testid="profile-avatar-file-input"
									accept="image/png,image/jpeg,image/webp"
									hidden
									onchange={onAvatarFile}
								/>
							</label>
							{#if avatarPreview}
								<div class="avatar">
									<div class="w-24 rounded-full">
										<img src={avatarPreview} alt={t('profile.avatar', 'Avatar')} />
									</div>
								</div>
							{/if}
							<small class="text-sm text-base-content/60">
								{t(
									'profile.photo_resize_note',
									'Images larger than 512 × 512 px are automatically resized.'
								)}
							</small>
						{/if}

						<div class="flex flex-wrap items-center gap-2">
							<button
								class="btn btn-primary"
								data-testid="profile-avatar-save-btn"
								disabled={avatarBusy}
								onclick={saveAvatar}
							>
								{t('profile.photo_save', 'Save')}
							</button>
							{#if session.user.image}
								<button
									class="btn btn-ghost btn-sm text-error"
									data-testid="profile-avatar-remove-btn"
									disabled={avatarBusy}
									onclick={() => commitAvatar(null)}
								>
									{t('profile.photo_remove', 'Remove photo')}
								</button>
							{/if}
							<button
								class="btn btn-ghost"
								data-testid="profile-avatar-cancel-btn"
								disabled={avatarBusy}
								onclick={closeAvatarEdit}
							>
								{t('common.cancel', 'Cancel')}
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Account details -->
		<div class="card border border-base-300 bg-base-100">
			<div class="card-body gap-3">
				<h2 class="card-title text-lg">
					<Icon name="id-card" />
					{t('profile.account_details', 'Account Details')}
				</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-1.5 text-sm text-base-content/60">
							<Icon name="user" />
							{t('profile.username', 'Username')}
						</div>
						<div class="font-medium break-words">{session.user.username || '—'}</div>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-1.5 text-sm text-base-content/60">
							<Icon name="envelope" />
							{t('profile.email', 'Email')}
						</div>
						<div class="font-medium break-words">{session.user.email}</div>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-1.5 text-sm text-base-content/60">
							<Icon name="shield-alt" />
							{t('profile.role', 'Role')}
						</div>
						<div class="font-medium break-words">
							{isAdmin ? t('profile.role_admin', 'Administrator') : t('profile.role_user', 'User')}
						</div>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-1.5 text-sm text-base-content/60">
							<Icon name="clock" />
							{t('profile.last_login', 'Last Login')}
						</div>
						<div class="font-medium break-words">{timeAgo(session.user.last_login_at)}</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Storage -->
		<div class="card border border-base-300 bg-base-100">
			<div class="card-body gap-3">
				<h2 class="card-title text-lg">
					<Icon name="hdd" />
					{t('profile.storage', 'Storage')}
				</h2>
				<div class="grid grid-cols-3 gap-2 text-center">
					<div class="flex flex-col gap-0.5 rounded-box bg-base-200 px-2 py-3">
						<div class="text-xl font-bold">{formatBytes(session.user.storage_used_bytes)}</div>
						<div class="text-sm text-base-content/60">{t('profile.used', 'Used')}</div>
					</div>
					<div class="flex flex-col gap-0.5 rounded-box bg-base-200 px-2 py-3">
						<div class="text-xl font-bold">
							{session.user.storage_quota_bytes > 0
								? formatBytes(session.user.storage_quota_bytes)
								: '∞'}
						</div>
						<div class="text-sm text-base-content/60">{t('profile.quota', 'Quota')}</div>
					</div>
					<div class="flex flex-col gap-0.5 rounded-box bg-base-200 px-2 py-3">
						<div class="text-xl font-bold">
							{session.user.storage_quota_bytes > 0 ? `${storagePct}%` : '—'}
						</div>
						<div class="text-sm text-base-content/60">{t('profile.usage', 'Usage')}</div>
					</div>
				</div>
				<progress class="progress w-full {storageBarClass}" value={storagePct} max="100"></progress>
			</div>
		</div>

		<!-- Edit profile (hidden for OIDC users) -->
		<div class="card border border-base-300 bg-base-100">
			<div class="card-body gap-3">
				<h2 class="card-title text-lg">
					<Icon name="id-badge" />
					{t('profile.edit_profile', 'Edit Profile')}
				</h2>
				{#if isOidc}
					<div class="alert alert-info alert-soft">
						<Icon name="info-circle" />
						<span>
							{t(
								'profile.edit_oidc_managed',
								'To change your information (name, profile picture, …), please update it at your identity provider. Your changes will appear on your next sign-in.'
							)}
						</span>
					</div>
				{:else}
					<form class="flex flex-col gap-3" data-testid="profile-edit-form" onsubmit={saveProfile}>
						<label class="flex flex-col gap-1.5 text-sm">
							<span>{t('profile.username', 'Username')}</span>
							<input
								class="input w-full"
								data-testid="profile-username-input"
								bind:value={username}
								maxlength="64"
								autocomplete="username"
								disabled={usernameClaimed}
							/>
							<small class="text-base-content/60">
								{usernameClaimed
									? t('profile.username_already_claimed', "Username can't be changed once set.")
									: t(
											'profile.username_claim_hint',
											"2–64 characters. Once chosen, the username can't be changed."
										)}
							</small>
						</label>
						<label class="flex flex-col gap-1.5 text-sm">
							<span>{t('profile.given_name', 'First name')}</span>
							<input
								class="input w-full"
								data-testid="profile-given-name-input"
								bind:value={givenName}
								maxlength="128"
								autocomplete="given-name"
							/>
						</label>
						<label class="flex flex-col gap-1.5 text-sm">
							<span>{t('profile.family_name', 'Last name')}</span>
							<input
								class="input w-full"
								data-testid="profile-family-name-input"
								bind:value={familyName}
								maxlength="128"
								autocomplete="family-name"
							/>
						</label>
						<label class="flex flex-col gap-1.5 text-sm">
							<span>{t('profile.language', 'Language')}</span>
							<select
								class="select w-full"
								data-testid="profile-language-select"
								bind:value={preferredLocale}
							>
								<option value="" data-testid="profile-language-auto-option"
									>{t('profile.language_auto', 'Automatic')}</option
								>
								{#each SUPPORTED_LOCALES as loc (loc)}
									<option value={loc} data-testid={`profile-language-option-${loc}`}>{loc}</option>
								{/each}
							</select>
						</label>
						<label class="flex flex-row items-center gap-2 text-sm">
							<input
								type="checkbox"
								class="checkbox"
								data-testid="profile-notify-on-share-checkbox"
								bind:checked={notifyOnShare}
							/>
							<span>{t('profile.notify_on_share', 'Email me when someone shares with me')}</span>
						</label>
						<button
							class="btn btn-primary self-start"
							type="submit"
							data-testid="profile-save-btn"
							disabled={savingProfile}>{t('profile.save_profile', 'Save changes')}</button
						>
					</form>
				{/if}
			</div>
		</div>

		<!-- App passwords -->
		{#if !appPwLoadFailed}
			<div class="card border border-base-300 bg-base-100">
				<div class="card-body gap-3">
					<h2 class="card-title text-lg">
						<Icon name="key" />
						{t('profile.app_passwords', 'App Passwords')}
					</h2>
					<p class="text-sm text-base-content/60">
						{t(
							'profile.app_pw_desc',
							'Generate passwords for WebDAV, CalDAV, and CardDAV clients. Each password is shown only once.'
						)}
					</p>

					<div class="flex flex-wrap gap-2">
						<input
							class="input min-w-48 flex-1"
							data-testid="profile-app-pw-label-input"
							bind:value={newLabel}
							maxlength="128"
							placeholder={t('profile.app_pw_label_placeholder', 'Label (e.g. Thunderbird, macOS)')}
						/>
						<button
							class="btn btn-primary gap-1.5"
							data-testid="profile-app-pw-generate-btn"
							disabled={creatingPw}
							onclick={createPw}
						>
							<Icon name="user-plus" />
							{t('profile.generate', 'Generate')}
						</button>
					</div>

					{#if generated}
						<div class="flex flex-col gap-1.5 rounded-box bg-base-200 p-3">
							<div>
								{t('profile.new_password_for', 'New password for')}
								<strong>{generated.label}</strong>:
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<code class="font-mono">{generated.password}</code>
								<button
									class="btn btn-ghost btn-sm btn-square"
									data-testid="profile-app-pw-copy-btn"
									title={t('profile.copy_to_clipboard', 'Copy to clipboard')}
									onclick={copyGenerated}
								>
									<Icon name="copy" />
								</button>
							</div>
							<small class="text-sm text-base-content/60">
								{t(
									'profile.copy_warning',
									"Copy this password now. You won't be able to see it again."
								)}
							</small>
						</div>
					{/if}

					{#if userPasswords.length === 0}
						<p class="text-sm text-base-content/60">
							{t('profile.no_app_passwords', 'No app passwords yet.')}
						</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="table table-sm">
								<thead>
									<tr>
										<th>{t('profile.col_label', 'Label')}</th>
										<th>{t('profile.col_created', 'Created')}</th>
										<th>{t('profile.col_last_used', 'Last Used')}</th>
										<th>{t('profile.col_status', 'Status')}</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each userPasswords as p (p.id)}
										<tr>
											<td>{p.label}</td>
											<td>{formatDate(p.created_at)}</td>
											<td
												>{p.last_used_at
													? timeAgo(p.last_used_at)
													: t('profile.never', 'Never')}</td
											>
											<td>
												{#if p.active !== false}
													<span class="badge badge-success badge-soft badge-sm"
														>{t('profile.active', 'Active')}</span
													>
												{:else}
													<span class="badge badge-ghost badge-sm"
														>{t('profile.revoked', 'Revoked')}</span
													>
												{/if}
											</td>
											<td>
												{#if p.active !== false}
													<button
														class="btn btn-ghost btn-sm btn-square text-error"
														data-testid={`profile-app-pw-revoke-${p.id}`}
														title={t('profile.revoke_title', 'Revoke')}
														onclick={() => revokePw(p)}
													>
														<Icon name="trash-alt" />
													</button>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}

					{#if autoPasswords.length > 0}
						<div class="border-t border-base-300 pt-2">
							<button
								class="btn btn-ghost btn-sm gap-2 px-1"
								data-testid="profile-app-pw-auto-toggle-btn"
								aria-expanded={autoExpanded}
								onclick={() => (autoExpanded = !autoExpanded)}
							>
								<Icon name={autoExpanded ? 'chevron-down' : 'chevron-right'} />
								<span>{t('profile.client_sessions', 'Client sessions')}</span>
								<span class="badge badge-ghost badge-sm">{autoPasswords.length}</span>
							</button>
							{#if autoExpanded}
								<p class="text-sm text-base-content/60">
									{t(
										'profile.client_sessions_desc',
										'Auto-generated when you connect a Nextcloud-compatible client.'
									)}
								</p>
								<div class="overflow-x-auto">
									<table class="table table-sm">
										<thead>
											<tr>
												<th>{t('profile.col_client', 'Client')}</th>
												<th>{t('profile.col_created', 'Created')}</th>
												<th>{t('profile.col_last_used', 'Last Used')}</th>
												<th></th>
											</tr>
										</thead>
										<tbody>
											{#each autoPasswords as p (p.id)}
												<tr>
													<td>{p.label}</td>
													<td>{formatDate(p.created_at)}</td>
													<td
														>{p.last_used_at
															? timeAgo(p.last_used_at)
															: t('profile.never', 'Never')}</td
													>
													<td>
														{#if p.active !== false}
															<button
																class="btn btn-ghost btn-sm btn-square text-error"
																data-testid={`profile-app-pw-auto-revoke-${p.id}`}
																title={t('profile.revoke_title', 'Revoke')}
																onclick={() => revokePw(p)}
															>
																<Icon name="trash-alt" />
															</button>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Change password -->
		{#if showPasswordCard}
			<form
				class="card border border-base-300 bg-base-100"
				data-testid="profile-password-form"
				onsubmit={savePassword}
			>
				<div class="card-body gap-3">
					<h2 class="card-title text-lg">
						<Icon name="key" />
						{t('profile.change_password', 'Change Password')}
					</h2>
					<label class="flex flex-col gap-1.5 text-sm">
						<span>{t('profile.current_password', 'Current Password')}</span>
						<input
							type="password"
							class="input w-full"
							data-testid="profile-current-password-input"
							bind:value={currentPw}
							autocomplete="current-password"
						/>
					</label>
					<label class="flex flex-col gap-1.5 text-sm">
						<span>{t('profile.new_password', 'New Password')}</span>
						<input
							type="password"
							class="input w-full"
							data-testid="profile-new-password-input"
							bind:value={newPw}
							minlength="8"
							autocomplete="new-password"
						/>
						<small class="text-base-content/60"
							>{t('profile.min_8_chars', 'At least 8 characters')}</small
						>
					</label>
					<label class="flex flex-col gap-1.5 text-sm">
						<span>{t('profile.confirm_password', 'Confirm New Password')}</span>
						<input
							type="password"
							class="input w-full"
							data-testid="profile-confirm-password-input"
							bind:value={confirmPw}
							minlength="8"
							autocomplete="new-password"
						/>
					</label>
					<button
						class="btn btn-primary self-start"
						type="submit"
						data-testid="profile-update-password-btn"
						disabled={savingPassword}
					>
						{t('profile.update_password', 'Update Password')}
					</button>
				</div>
			</form>
		{/if}
	{:else}
		<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
	{/if}
</main>
