<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/index.svelte';
	import NcStatus from '../NcStatus.svelte';

	function closeWindow() {
		window.close();
	}

	onMount(() => {
		// Mirror the legacy flow: auto-close the popup shortly after success so
		// the user is returned to their Nextcloud client without an extra click.
		const timer = setTimeout(closeWindow, 3000);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head><title>{t('nextcloud.success_title', 'Access granted')} · OxiCloud</title></svelte:head
>

<NcStatus
	icon="check"
	iconClass="text-success"
	title={t('nextcloud.success_title', 'Access granted')}
	message={t('nextcloud.success_body', 'You can now return to your application — it is connected.')}
	actionLabel={t('nextcloud.close_window', 'Close Window')}
	actionTestid="nextcloud-success-close-btn"
	onaction={closeWindow}
/>
