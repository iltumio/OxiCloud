<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import { onMount } from 'svelte';
	import {
		exchangeOidcCode,
		fetchMe,
		getAuthStatus,
		getOidcProviders,
		login,
		register,
		sendMagicLink,
		setupAdmin,
		type OidcProviders
	} from '$lib/api/endpoints/auth';
	import { i18n, SUPPORTED_LOCALES, setLocale, t, type Locale } from '$lib/i18n/index.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { session } from '$lib/stores/session.svelte';
	import AuthLogo from '../AuthLogo.svelte';

	type Mode = 'login' | 'register' | 'setup';
	let mode = $state<Mode>('login');
	// First-run admin setup is only offered after the status probe confirms it.
	let setupAvailable = $state(false);
	// Suppress the auth UI until the onMount probes (session/oidc/status) settle,
	// to avoid flashing the login form before a redirect or the setup wizard.
	let booting = $state(true);

	// Login
	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let capsOn = $state(false);
	let error = $state('');
	let busy = $state(false);

	// Register
	let regUsername = $state('');
	let regEmail = $state('');
	let regPassword = $state('');
	let regConfirm = $state('');
	let regError = $state('');
	let regSuccess = $state('');
	let regShowPassword = $state(false);
	let regShowConfirm = $state(false);
	let regCapsOn = $state(false);

	// Admin setup (first run)
	let setupEmail = $state('');
	let setupPassword = $state('');
	let setupConfirm = $state('');
	let setupShowPassword = $state(false);
	let setupShowConfirm = $state(false);
	let setupCapsOn = $state(false);
	let setupError = $state('');
	let setupSuccess = $state('');
	const setupMatchState = $derived(
		setupConfirm.length === 0 ? '' : setupPassword === setupConfirm ? 'ok' : 'bad'
	);

	// Magic link
	let magicOpen = $state(false);
	let magicEmail = $state('');
	let magicStatus = $state<{ text: string; ok: boolean } | null>(null);

	// OIDC
	let oidc = $state<OidcProviders>({ enabled: false });
	const passwordLoginEnabled = $derived(oidc.password_login_enabled !== false);

	// The redirect target is an in-SPA destination (e.g. /files or a deep link a
	// guard bounced us from). It's user-supplied via the query string so its exact
	// value isn't a known route literal — cast to Pathname for resolve().
	const redirectTarget = $derived((page.url.searchParams.get('redirect') || '/files') as Pathname);
	const matchState = $derived(
		regConfirm.length === 0 ? '' : regPassword === regConfirm ? 'ok' : 'bad'
	);

	function csrfCookiePresent(): boolean {
		return document.cookie.split('; ').some((c) => c.startsWith('oxicloud_csrf='));
	}

	function onPwKey(e: KeyboardEvent) {
		capsOn = e.getModifierState?.('CapsLock') ?? false;
	}

	function onRegPwKey(e: KeyboardEvent) {
		regCapsOn = e.getModifierState?.('CapsLock') ?? false;
	}

	function onSetupPwKey(e: KeyboardEvent) {
		setupCapsOn = e.getModifierState?.('CapsLock') ?? false;
	}

	async function onLogin(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		try {
			const data = await login(username, password);
			if (!csrfCookiePresent()) {
				error = t(
					'auth.cookie_rejected',
					'Login succeeded but the browser rejected the session cookie. If you are on HTTP, set OXICLOUD_COOKIE_SECURE=false or use HTTPS.'
				);
				return;
			}
			session.setUser(data.user);
			await goto(resolve(redirectTarget), { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : t('auth.login_error', 'Error logging in');
		} finally {
			busy = false;
		}
	}

	async function onRegister(e: SubmitEvent) {
		e.preventDefault();
		regError = '';
		regSuccess = '';
		if (regPassword !== regConfirm) {
			regError = t('auth.passwords_mismatch', 'Passwords do not match');
			return;
		}
		busy = true;
		try {
			await register(regUsername, regEmail, regPassword);
			regSuccess = t('auth.account_success', 'Account created. You can now sign in.');
			regUsername = regEmail = regPassword = regConfirm = '';
			setTimeout(() => (mode = 'login'), 2000);
		} catch (err) {
			regError =
				err instanceof Error ? err.message : t('auth.register_error', 'Registration failed');
		} finally {
			busy = false;
		}
	}

	async function onSetup(e: SubmitEvent) {
		e.preventDefault();
		setupError = '';
		setupSuccess = '';
		if (setupPassword !== setupConfirm) {
			setupError = t('auth.passwords_mismatch', 'Passwords do not match');
			return;
		}
		busy = true;
		try {
			await setupAdmin(setupEmail, setupPassword);
			setupSuccess = t('auth.admin_success', 'Administrator created. You can now sign in.');
			setupEmail = setupPassword = setupConfirm = '';
			// Admin now exists — fold the setup affordance away and return to login.
			setupAvailable = false;
			setTimeout(() => {
				mode = 'login';
				setupSuccess = '';
			}, 2000);
		} catch (err) {
			setupError =
				err instanceof Error ? err.message : t('auth.admin_create_error', 'Setup failed');
		} finally {
			busy = false;
		}
	}

	async function onMagicLink(e: SubmitEvent) {
		e.preventDefault();
		if (!magicEmail) return;
		magicStatus = null;
		busy = true;
		try {
			const result = await sendMagicLink(magicEmail);
			magicStatus =
				result === 'sent'
					? {
							text: t(
								'auth.magic_sent',
								'If an account exists, a sign-in link has been sent. Check your inbox.'
							),
							ok: true
						}
					: {
							text: t(
								'auth.magic_unavailable',
								'Sign-in by email is not available on this server.'
							),
							ok: false
						};
			if (result === 'sent') magicEmail = '';
		} catch {
			magicStatus = { text: t('auth.magic_error', 'Something went wrong. Try again.'), ok: false };
		} finally {
			busy = false;
		}
	}

	onMount(async () => {
		// 1) OIDC code-exchange fallback: the IdP round-trip may land back here
		//    with ?oidc_code=. Exchange it for a session and redirect into the app.
		const oidcCode = page.url.searchParams.get('oidc_code');
		if (oidcCode) {
			const user = await exchangeOidcCode(oidcCode);
			if (user) {
				session.setUser(user);
				await goto(resolve(redirectTarget), { replaceState: true });
				return;
			}
			// Exchange failed — fall through to the normal login UI.
		}

		// 2) Existing-session probe: if already authenticated, skip the form.
		try {
			const me = await fetchMe();
			if (me) {
				session.setUser(me);
				await goto(resolve(redirectTarget), { replaceState: true });
				return;
			}
		} catch {
			/* probe failed — show the login page */
		}

		// 3) Bootstrap probe: a fresh install (no admin) must be set up first.
		const [providers, status] = await Promise.all([getOidcProviders(), getAuthStatus()]);
		oidc = providers;
		setupAvailable = !status.initialized;
		if (setupAvailable) mode = 'setup';

		booting = false;
	});
</script>

<svelte:head>
	<title>{t('app.title', 'OxiCloud')}</title>
</svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-md border border-base-300 bg-base-100 shadow-xl">
		<div class="card-body items-center gap-4 p-6 text-center sm:p-9">
			<AuthLogo />

			{#if booting}
				<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else}
				<h1 class="text-2xl font-bold">
					{#if mode === 'login'}
						{t('auth.sign_in', 'Sign in')}
					{:else if mode === 'register'}
						{t('auth.register', 'Create account')}
					{:else}
						{t('auth.setup_title', 'Initial setup')}
					{/if}
				</h1>

				{#if page.url.searchParams.get('source') === 'session_expired'}
					<div class="alert alert-warning alert-soft w-full text-sm">
						{t('auth.session_expired', 'Your session expired. Please sign in again.')}
					</div>
				{/if}

				{#if mode === 'login'}
					{#if passwordLoginEnabled}
						{#if error}
							<div class="alert alert-error alert-soft w-full text-sm" role="alert">{error}</div>
						{/if}
						<form
							class="flex w-full flex-col gap-4 text-start"
							data-testid="login-form"
							onsubmit={onLogin}
							novalidate
						>
							<div class="flex flex-col gap-1.5">
								<label class="text-sm font-semibold" for="login-username">
									{t('auth.username', 'Username or email')}
								</label>
								<label class="input w-full">
									<Icon name="user" class="text-base-content/40" />
									<input
										id="login-username"
										class="grow"
										data-testid="login-username-input"
										type="text"
										bind:value={username}
										autocomplete="username"
										required
										disabled={busy}
									/>
								</label>
							</div>

							<div class="flex flex-col gap-1.5">
								<label class="text-sm font-semibold" for="login-password"
									>{t('auth.password', 'Password')}</label
								>
								<label class="input w-full">
									<Icon name="lock" class="text-base-content/40" />
									<input
										id="login-password"
										class="grow"
										data-testid="login-password-input"
										type={showPassword ? 'text' : 'password'}
										bind:value={password}
										onkeydown={onPwKey}
										onkeyup={onPwKey}
										autocomplete="current-password"
										required
										disabled={busy}
									/>
									<button
										type="button"
										class="btn btn-ghost btn-xs btn-square {showPassword
											? 'text-base-content'
											: 'text-base-content/40'}"
										aria-pressed={showPassword}
										data-testid="login-password-toggle-btn"
										aria-label={t('auth.toggle_password', 'Show password')}
										onclick={() => (showPassword = !showPassword)}
									>
										<Icon name="eye" />
									</button>
								</label>
								{#if capsOn}
									<div class="text-sm text-warning">{t('auth.caps_lock', 'Caps Lock is on')}</div>
								{/if}
							</div>

							<button
								class="btn btn-primary w-full"
								type="submit"
								data-testid="login-submit-btn"
								disabled={busy}
								aria-busy={busy}
							>
								{#if busy}<span class="loading loading-spinner loading-sm"></span>{/if}
								{busy ? t('auth.signing_in', 'Signing in…') : t('auth.sign_in', 'Sign in')}
							</button>
						</form>

						<button
							class="link text-sm text-base-content/70 link-hover"
							data-testid="login-magic-toggle-btn"
							onclick={() => (magicOpen = !magicOpen)}
						>
							{t('auth.magic_prompt', 'No password? Sign in with an email link')}
						</button>
						{#if magicOpen}
							<div class="flex w-full flex-col gap-3">
								<p class="text-sm text-base-content/70">
									{t(
										'auth.magic_hint',
										"No password? Enter your email and we'll send you a one-time sign-in link."
									)}
								</p>
								<form
									class="flex w-full flex-col gap-4 text-start"
									data-testid="login-magic-form"
									onsubmit={onMagicLink}
								>
									<div class="flex flex-col gap-1.5">
										<label class="text-sm font-semibold" for="magic-email">
											{t('auth.magic_email_label', 'Email address')}
										</label>
										<label class="input w-full">
											<Icon name="envelope" class="text-base-content/40" />
											<input
												id="magic-email"
												class="grow"
												data-testid="login-magic-email-input"
												type="email"
												bind:value={magicEmail}
												autocomplete="email"
												placeholder={t('auth.email', 'you@example.com')}
											/>
										</label>
									</div>
									<button
										class="btn btn-outline w-full"
										type="submit"
										data-testid="login-magic-send-btn"
										disabled={busy}
									>
										{t('auth.magic_send', 'Send link')}
									</button>
								</form>
								{#if magicStatus}
									<div
										class="alert alert-soft w-full text-sm {magicStatus.ok
											? 'alert-success'
											: 'alert-error'}"
									>
										{magicStatus.text}
									</div>
								{/if}
							</div>
						{/if}
					{/if}

					{#if oidc.enabled}
						{#if passwordLoginEnabled}
							<div class="divider my-0 w-full text-sm text-base-content/60">
								{t('auth.or', 'or')}
							</div>
						{/if}
						<!-- Backend OIDC authorize endpoint (not a SvelteKit route). -->
						<a
							class="btn btn-outline w-full"
							data-testid="login-oidc-btn"
							href={oidc.authorize_endpoint}
							rel="external"
						>
							{t(
								'auth.sso_login_provider',
								{ provider: oidc.provider_name ?? 'SSO' },
								'Sign in with {{provider}}'
							)}
						</a>
					{/if}

					{#if passwordLoginEnabled}
						<div class="text-sm text-base-content/70">
							{t('auth.no_account', 'No account?')}
							<button
								class="link text-primary link-hover"
								data-testid="login-to-register-btn"
								onclick={() => (mode = 'register')}
							>
								{t('auth.register', 'Create one')}
							</button>
						</div>
					{/if}

					{#if setupAvailable}
						<div class="text-sm text-base-content/70">
							{t('auth.admin_setup', 'First time?')}
							<button
								class="link text-primary link-hover"
								data-testid="login-to-setup-btn"
								onclick={() => (mode = 'setup')}
							>
								{t('auth.setup', 'Set up administrator')}
							</button>
						</div>
					{/if}
				{:else if mode === 'register'}
					{#if regError}
						<div class="alert alert-error alert-soft w-full text-sm" role="alert">{regError}</div>
					{/if}
					{#if regSuccess}
						<div class="alert alert-success alert-soft w-full text-sm">{regSuccess}</div>
					{/if}
					<form
						class="flex w-full flex-col gap-4 text-start"
						data-testid="login-register-form"
						onsubmit={onRegister}
						novalidate
					>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="reg-username"
								>{t('auth.username', 'Username')}</label
							>
							<input
								id="reg-username"
								class="input w-full"
								data-testid="login-register-username-input"
								bind:value={regUsername}
								required
								disabled={busy}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="reg-email">{t('auth.email', 'Email')}</label
							>
							<input
								id="reg-email"
								class="input w-full"
								data-testid="login-register-email-input"
								type="email"
								bind:value={regEmail}
								required
								disabled={busy}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="reg-password"
								>{t('auth.password', 'Password')}</label
							>
							<label class="input w-full">
								<Icon name="lock" class="text-base-content/40" />
								<input
									id="reg-password"
									class="grow"
									data-testid="login-register-password-input"
									type={regShowPassword ? 'text' : 'password'}
									bind:value={regPassword}
									onkeydown={onRegPwKey}
									onkeyup={onRegPwKey}
									autocomplete="new-password"
									required
									disabled={busy}
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square {regShowPassword
										? 'text-base-content'
										: 'text-base-content/40'}"
									aria-pressed={regShowPassword}
									data-testid="login-register-password-toggle-btn"
									aria-label={t('auth.toggle_password', 'Show password')}
									onclick={() => (regShowPassword = !regShowPassword)}
								>
									<Icon name="eye" />
								</button>
							</label>
							{#if regCapsOn}
								<div class="text-sm text-warning">{t('auth.caps_lock', 'Caps Lock is on')}</div>
							{/if}
						</div>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="reg-confirm"
								>{t('auth.confirm_password', 'Confirm password')}</label
							>
							<label class="input w-full">
								<Icon name="lock" class="text-base-content/40" />
								<input
									id="reg-confirm"
									class="grow"
									data-testid="login-register-confirm-input"
									type={regShowConfirm ? 'text' : 'password'}
									bind:value={regConfirm}
									onkeydown={onRegPwKey}
									onkeyup={onRegPwKey}
									autocomplete="new-password"
									required
									disabled={busy}
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square {regShowConfirm
										? 'text-base-content'
										: 'text-base-content/40'}"
									aria-pressed={regShowConfirm}
									data-testid="login-register-confirm-toggle-btn"
									aria-label={t('auth.toggle_password', 'Show password')}
									onclick={() => (regShowConfirm = !regShowConfirm)}
								>
									<Icon name="eye" />
								</button>
							</label>
							{#if matchState}
								<div class="text-sm {matchState === 'ok' ? 'text-success' : 'text-error'}">
									{matchState === 'ok'
										? t('auth.passwords_match', 'Passwords match')
										: t('auth.passwords_mismatch', "Passwords don't match")}
								</div>
							{/if}
						</div>
						<button
							class="btn btn-primary w-full"
							type="submit"
							data-testid="login-register-submit-btn"
							disabled={busy}
							aria-busy={busy}
						>
							{#if busy}<span class="loading loading-spinner loading-sm"></span>{/if}
							{t('auth.register', 'Create account')}
						</button>
					</form>
					<div class="text-sm text-base-content/70">
						{t('auth.have_account', 'Already have an account?')}
						<button
							class="link text-primary link-hover"
							data-testid="login-register-to-login-btn"
							onclick={() => (mode = 'login')}
						>
							{t('auth.sign_in', 'Sign in')}
						</button>
					</div>
				{:else}
					<ul class="steps w-full text-sm">
						<li class="step step-primary">{t('auth.setup_step1', 'Admin')}</li>
						<li class="step">{t('auth.setup_step2', 'System')}</li>
						<li class="step">{t('auth.setup_step3', 'Completed')}</li>
					</ul>

					{#if setupError}
						<div class="alert alert-error alert-soft w-full text-sm" role="alert">{setupError}</div>
					{/if}
					{#if setupSuccess}
						<div class="alert alert-success alert-soft w-full text-sm">{setupSuccess}</div>
					{/if}

					<form
						class="flex w-full flex-col gap-4 text-start"
						data-testid="login-setup-form"
						onsubmit={onSetup}
						novalidate
					>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="setup-username">
								{t('auth.admin_username', 'Administrator username')}
							</label>
							<label class="input w-full bg-base-200">
								<Icon name="user" class="text-base-content/40" />
								<input
									id="setup-username"
									class="grow font-semibold"
									data-testid="login-setup-username-input"
									type="text"
									value="admin"
									readonly
								/>
							</label>
						</div>

						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="setup-email">
								{t('auth.admin_email', 'Administrator email')}
							</label>
							<label class="input w-full">
								<Icon name="envelope" class="text-base-content/40" />
								<input
									id="setup-email"
									class="grow"
									data-testid="login-setup-email-input"
									type="email"
									bind:value={setupEmail}
									autocomplete="email"
									required
									disabled={busy}
								/>
							</label>
						</div>

						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="setup-password">
								{t('auth.admin_password', 'Administrator password')}
							</label>
							<label class="input w-full">
								<Icon name="lock" class="text-base-content/40" />
								<input
									id="setup-password"
									class="grow"
									data-testid="login-setup-password-input"
									type={setupShowPassword ? 'text' : 'password'}
									bind:value={setupPassword}
									onkeydown={onSetupPwKey}
									onkeyup={onSetupPwKey}
									autocomplete="new-password"
									minlength="8"
									required
									disabled={busy}
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square {setupShowPassword
										? 'text-base-content'
										: 'text-base-content/40'}"
									aria-pressed={setupShowPassword}
									data-testid="login-setup-password-toggle-btn"
									aria-label={t('auth.toggle_password', 'Show password')}
									onclick={() => (setupShowPassword = !setupShowPassword)}
								>
									<Icon name="eye" />
								</button>
							</label>
							{#if setupCapsOn}
								<div class="text-sm text-warning">{t('auth.caps_lock', 'Caps Lock is on')}</div>
							{/if}
						</div>

						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="setup-confirm">
								{t('auth.confirm_password', 'Confirm password')}
							</label>
							<label class="input w-full">
								<Icon name="lock" class="text-base-content/40" />
								<input
									id="setup-confirm"
									class="grow"
									data-testid="login-setup-confirm-input"
									type={setupShowConfirm ? 'text' : 'password'}
									bind:value={setupConfirm}
									onkeydown={onSetupPwKey}
									onkeyup={onSetupPwKey}
									autocomplete="new-password"
									required
									disabled={busy}
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square {setupShowConfirm
										? 'text-base-content'
										: 'text-base-content/40'}"
									aria-pressed={setupShowConfirm}
									data-testid="login-setup-confirm-toggle-btn"
									aria-label={t('auth.toggle_password', 'Show password')}
									onclick={() => (setupShowConfirm = !setupShowConfirm)}
								>
									<Icon name="eye" />
								</button>
							</label>
							{#if setupMatchState}
								<div class="text-sm {setupMatchState === 'ok' ? 'text-success' : 'text-error'}">
									{setupMatchState === 'ok'
										? t('auth.passwords_match', 'Passwords match')
										: t('auth.passwords_mismatch', "Passwords don't match")}
								</div>
							{/if}
						</div>

						<button
							class="btn btn-primary w-full"
							type="submit"
							data-testid="login-setup-submit-btn"
							disabled={busy}
							aria-busy={busy}
						>
							{#if busy}<span class="loading loading-spinner loading-sm"></span>{/if}
							{t('auth.create_admin', 'Create administrator')}
						</button>
					</form>

					<div class="text-sm text-base-content/70">
						{t('auth.back_to_login', 'Already configured?')}
						<button
							class="link text-primary link-hover"
							data-testid="login-setup-to-login-btn"
							onclick={() => (mode = 'login')}
						>
							{t('auth.sign_in', 'Sign in')}
						</button>
					</div>
				{/if}
			{/if}

			<div class="mt-2">
				<select
					class="select select-sm w-auto"
					aria-label={t('settings.language', 'Language')}
					data-testid="login-language-select"
					value={i18n.locale}
					onchange={(e) => setLocale(e.currentTarget.value as Locale)}
				>
					{#each SUPPORTED_LOCALES as loc (loc)}
						<option value={loc}>{loc}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>
</div>
