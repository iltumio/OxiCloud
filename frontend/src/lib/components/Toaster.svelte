<script lang="ts">
	import { ui, type ToastKind } from '$lib/stores/ui.svelte';
	import { t } from '$lib/i18n/index.svelte';

	const ALERT_CLASS: Record<ToastKind, string> = {
		success: 'alert-success',
		error: 'alert-error',
		warning: 'alert-warning',
		info: 'alert-info'
	};
</script>

<!-- Bottom offset clears any bottom-right FAB the file view may mount; the
     --toaster-offset hook lets a page lift the stack further if needed.
     pointer-events-none lets clicks pass through the gaps; individual toasts
     re-enable below. -->
<div
	class="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px)+var(--toaster-offset,0px))] right-4 z-[1200] flex max-w-[min(92vw,24rem)] flex-col gap-2"
	role="region"
	aria-live="polite"
	aria-label={t('notifications.title', 'Notifications')}
>
	{#each ui.toasts as toast (toast.id)}
		<div
			class="alert alert-soft pointer-events-auto shadow-md {ALERT_CLASS[toast.kind]}"
			role="status"
			data-testid={`toaster-toast-${toast.id}`}
		>
			<span class="flex-1">{toast.message}</span>
			<button
				class="btn btn-circle btn-ghost btn-xs text-lg opacity-70 hover:opacity-100"
				data-testid={`toaster-dismiss-btn-${toast.id}`}
				aria-label={t('common.dismiss', 'Dismiss')}
				onclick={() => ui.dismiss(toast.id)}
			>
				×
			</button>
		</div>
	{/each}
</div>
