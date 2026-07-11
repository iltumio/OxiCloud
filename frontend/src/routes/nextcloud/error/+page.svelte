<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n/index.svelte';
	import NcStatus from '../NcStatus.svelte';

	type ErrorAction = 'retry' | 'close';
	interface ErrorView {
		title: string;
		message: string;
		actionLabel: string;
		action: ErrorAction;
	}

	// Legacy used `?type=`; the rewrite briefly renamed it to `?reason=`. Read
	// `type` first and fall back to `reason` so older links keep working.
	const errorType = $derived(
		page.url.searchParams.get('type') ?? page.url.searchParams.get('reason') ?? 'generic'
	);

	const view = $derived<ErrorView>(buildView(errorType));

	function buildView(type: string): ErrorView {
		switch (type) {
			case 'invalid-credentials':
				return {
					title: t('nextcloud.error_invalid_title', 'Login Failed'),
					message: t(
						'nextcloud.error_invalid_body',
						'Invalid username or password. Please check your credentials and try again.'
					),
					actionLabel: t('common.retry', 'Try Again'),
					action: 'retry'
				};
			case 'session-expired':
				return {
					title: t('nextcloud.error_expired_title', 'Session Expired'),
					message: t('nextcloud.error_expired_body', 'Your session has expired. Please try again.'),
					actionLabel: t('nextcloud.close_window', 'Close Window'),
					action: 'close'
				};
			case 'not-found':
				return {
					title: t('nextcloud.error_notfound_title', 'Not Found'),
					message: t('nextcloud.error_notfound_body', 'The requested page was not found.'),
					actionLabel: t('nextcloud.close_window', 'Close Window'),
					action: 'close'
				};
			default:
				return {
					title: t('nextcloud.error_title', 'Error'),
					message: t(
						'nextcloud.error_generic_body',
						'An unexpected error occurred. Please try again.'
					),
					actionLabel: t('nextcloud.close_window', 'Close Window'),
					action: 'close'
				};
		}
	}

	function onAction() {
		if (view.action === 'retry') history.back();
		else window.close();
	}
</script>

<svelte:head><title>{view.title} · OxiCloud</title></svelte:head>

<NcStatus
	icon="ban"
	iconClass="text-error"
	title={view.title}
	message={view.message}
	actionLabel={view.actionLabel}
	actionTestid="nextcloud-error-action-btn"
	onaction={onAction}
/>
