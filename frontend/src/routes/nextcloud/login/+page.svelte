<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getOidcProviders } from '$lib/api/endpoints/auth';
	import { t } from '$lib/i18n/index.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import AuthLogo from '../../AuthLogo.svelte';

	// Nextcloud Login Flow v2. The form does a NATIVE POST to the backend flow
	// endpoint so the server drives the redirect handshake — do not intercept it.
	// The flow token is hex; reject anything else to prevent action injection.
	const token = $derived(page.url.searchParams.get('token') ?? '');
	const validToken = $derived(/^[0-9a-fA-F]+$/.test(token));
	const formAction = $derived(`/login/v2/flow/${token}`);

	let oidcEnabled = $state(false);
	let oidcProvider = $state('SSO');
	let passwordLoginEnabled = $state(true);

	onMount(async () => {
		const info = await getOidcProviders();
		if (!info.enabled) return;
		oidcEnabled = true;
		oidcProvider = info.provider_name || 'SSO';
		passwordLoginEnabled = info.password_login_enabled !== false;
	});
</script>

<svelte:head><title>{t('app.title', 'OxiCloud')}</title></svelte:head>

<div class="flex min-h-dvh w-full items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-md border border-base-300 bg-base-100 shadow-xl">
		<div class="card-body items-center gap-4 p-6 text-center sm:p-9">
			<AuthLogo />

			<h1 class="text-2xl font-bold">{t('nextcloud.grant_title', 'Grant access')}</h1>
			<p class="text-sm text-base-content/70">
				{t('nextcloud.grant_subtitle', 'A Nextcloud client is requesting access to your account.')}
			</p>

			{#if !validToken}
				<div class="alert alert-error alert-soft w-full text-sm" role="alert">
					{t('nextcloud.invalid_token', 'Invalid session token.')}
				</div>
			{:else}
				{#if passwordLoginEnabled}
					<form
						class="flex w-full flex-col gap-4 text-start"
						data-testid="nextcloud-login-form"
						method="post"
						action={formAction}
					>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="nc-user"
								>{t('auth.username', 'Username or email')}</label
							>
							<label class="input w-full">
								<Icon name="user" class="text-base-content/40" />
								<input
									id="nc-user"
									class="grow"
									data-testid="nextcloud-login-user-input"
									name="user"
									type="text"
									autocomplete="username"
									required
								/>
							</label>
						</div>
						<div class="flex flex-col gap-1.5">
							<label class="text-sm font-semibold" for="nc-password"
								>{t('auth.password', 'Password')}</label
							>
							<label class="input w-full">
								<Icon name="lock" class="text-base-content/40" />
								<input
									id="nc-password"
									class="grow"
									data-testid="nextcloud-login-password-input"
									name="password"
									type="password"
									autocomplete="current-password"
									required
								/>
							</label>
						</div>
						<button
							class="btn btn-primary w-full"
							data-testid="nextcloud-login-grant-btn"
							type="submit">{t('nextcloud.grant', 'Grant access')}</button
						>
					</form>
				{/if}

				{#if oidcEnabled}
					{#if passwordLoginEnabled}
						<div class="divider my-0 w-full text-sm text-base-content/60">{t('auth.or', 'or')}</div>
					{/if}
					<!-- Backend Nextcloud Login Flow v2 OIDC handshake (not a SvelteKit route). -->
					<a
						class="btn btn-outline w-full"
						data-testid="nextcloud-login-sso-link"
						href={`/login/v2/flow/${token}/oidc`}
						rel="external"
					>
						{t('nextcloud.sign_in_with', { provider: oidcProvider }, 'Sign in with {{provider}}')}
					</a>
				{/if}
			{/if}
		</div>
	</div>
</div>
