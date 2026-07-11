<script lang="ts">
	import { errorMessage } from '$lib/utils/errors';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		decideDevice,
		DeviceLookupFailure,
		lookupDeviceCode,
		type DeviceInfo
	} from '$lib/api/endpoints/device';
	import { t } from '$lib/i18n/index.svelte';
	import AuthLogo from '../AuthLogo.svelte';

	type Step = 'code' | 'loading' | 'review' | 'approved' | 'denied' | 'error';

	// A complete user-code is 8 chars + a hyphen (e.g. ABCD-1234) → length 9.
	const FULL_CODE_LENGTH = 9;

	let code = $state(page.url.searchParams.get('code') ?? '');
	let step = $state<Step>('code');
	let info = $state<DeviceInfo | null>(null);
	let errorText = $state('');
	let busy = $state(false);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let codeInput = $state<HTMLInputElement | null>(null);

	function failureMessage(err: unknown): string {
		if (err instanceof DeviceLookupFailure) {
			switch (err.kind) {
				case 'unauthorized':
					return t(
						'device.unauthorized',
						'You must be logged in to authorize a device. Please log in first.'
					);
				case 'not-found':
					return t('device.not_found', 'Code not found or expired. Please check and try again.');
				default:
					return t('device.lookup_failed', 'Failed to verify code. Please try again.');
			}
		}
		return errorMessage(err);
	}

	async function lookup(e?: SubmitEvent) {
		e?.preventDefault();
		if (!code) return;
		step = 'loading';
		errorText = '';
		try {
			info = await lookupDeviceCode(code);
			step = 'review';
		} catch (err) {
			errorText = failureMessage(err);
			step = 'error';
		}
	}

	/**
	 * Normalise the code field as the user types: uppercase, strip anything
	 * that isn't [A-Z0-9-], auto-insert the hyphen after the first 4 chars,
	 * then debounce a lookup once a full code is present.
	 */
	function onCodeInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		let val = target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
		if (val.length === 4 && !val.includes('-')) val = `${val}-`;
		code = val;
		// Reflect the normalised value back into the input.
		target.value = val;
		if (step === 'error') {
			step = 'code';
			errorText = '';
		}

		clearTimeout(debounceTimer);
		if (val.length >= FULL_CODE_LENGTH) {
			debounceTimer = setTimeout(() => void lookup(), 300);
		}
	}

	async function decide(action: 'approve' | 'deny') {
		busy = true;
		try {
			await decideDevice(code, action);
			step = action === 'approve' ? 'approved' : 'denied';
		} catch (err) {
			errorText = errorMessage(err);
			step = 'error';
		} finally {
			busy = false;
		}
	}

	function backToCode() {
		step = 'code';
		errorText = '';
		// Re-focus so the user can correct the code immediately.
		queueMicrotask(() => codeInput?.focus());
	}

	onMount(() => {
		if (code) void lookup();
		else codeInput?.focus();
	});
</script>

<svelte:head><title>{t('device.title', 'Device verification')} · OxiCloud</title></svelte:head>

<main class="grid min-h-dvh place-items-center bg-base-200 p-4">
	<div class="card w-full max-w-sm border border-base-300 bg-base-100 shadow-lg">
		<div class="card-body gap-4">
			<AuthLogo />
			<h1 class="text-xl font-bold">{t('device.title', 'Device verification')}</h1>

			{#if step === 'code'}
				<form class="flex flex-col gap-4" data-testid="device-code-form" onsubmit={lookup}>
					<label class="flex flex-col gap-1.5">
						<span class="text-sm"
							>{t('device.enter_code', 'Enter the code shown on your device')}</span
						>
						<input
							class="input input-lg w-full text-center tracking-widest"
							bind:this={codeInput}
							data-testid="device-code-input"
							value={code}
							oninput={onCodeInput}
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							inputmode="text"
							maxlength={FULL_CODE_LENGTH}
						/>
					</label>
					<button
						class="btn btn-primary"
						type="submit"
						data-testid="device-continue-btn"
						disabled={!code}>{t('device.continue', 'Continue')}</button
					>
				</form>
			{:else if step === 'loading'}
				<p class="text-base-content/60">{t('common.loading', 'Loading…')}</p>
			{:else if step === 'review'}
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
					<dt class="text-base-content/60">{t('device.client', 'Application')}</dt>
					<dd>{info?.client_name || t('device.unknown', 'Unknown')}</dd>
					<dt class="text-base-content/60">{t('device.scopes', 'Access')}</dt>
					<dd>{info?.scopes || 'all'}</dd>
				</dl>
				<div class="flex justify-end gap-2">
					<button
						class="btn btn-ghost text-error"
						data-testid="device-deny-btn"
						disabled={busy}
						onclick={() => decide('deny')}
					>
						{t('device.deny', 'Deny')}
					</button>
					<button
						class="btn btn-primary"
						data-testid="device-approve-btn"
						disabled={busy}
						onclick={() => decide('approve')}
					>
						{t('device.approve', 'Approve')}
					</button>
				</div>
			{:else if step === 'approved'}
				<p class="text-success">
					{t('device.approved', 'Device approved. You can return to your device.')}
				</p>
			{:else if step === 'denied'}
				<p>{t('device.denied', 'Device access denied.')}</p>
			{:else if step === 'error'}
				<p class="text-error" role="alert">{errorText}</p>
				<button class="btn" data-testid="device-retry-btn" onclick={backToCode}
					>{t('common.retry', 'Try again')}</button
				>
			{/if}
		</div>
	</div>
</main>
