<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/index.svelte';

	interface Props {
		open: boolean;
		title?: string;
		/** Called when the user requests close (backdrop click, Escape, ✕). */
		onclose?: () => void;
		children?: Snippet;
		footer?: Snippet;
	}

	let { open = $bindable(false), title, onclose, children, footer }: Props = $props();

	let dialogEl = $state<HTMLElement | null>(null);
	let prevFocus: HTMLElement | null = null;

	function close() {
		open = false;
		onclose?.();
	}

	const FOCUSABLE =
		'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

	function focusables(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
			return;
		}
		// Focus trap: keep Tab cycling inside the dialog.
		if (e.key === 'Tab') {
			const items = focusables();
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement as HTMLElement | null;
			if (e.shiftKey && active === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// On open: remember the previously focused element and move focus into the
	// dialog. On close: restore focus so keyboard users aren't dumped at <body>.
	$effect(() => {
		if (open) {
			prevFocus = (document.activeElement as HTMLElement | null) ?? null;
			requestAnimationFrame(() => {
				const items = focusables();
				(items[0] ?? dialogEl)?.focus();
			});
		} else if (prevFocus) {
			prevFocus.focus();
			prevFocus = null;
		}
	});
</script>

<svelte:window onkeydown={open ? onkeydown : undefined} />

{#if open}
	<!-- daisyUI modal: `.modal.modal-open` dims the page and animates the box in. -->
	<div
		class="modal modal-open"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			class="modal-box flex max-h-[90vh] flex-col p-0 motion-reduce:transition-none"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			data-testid="modal"
			bind:this={dialogEl}
		>
			{#if title}
				<header class="flex items-center justify-between border-b border-base-300 px-5 py-4">
					<h2 class="m-0 text-lg font-semibold">{title}</h2>
					<button
						class="btn btn-circle btn-ghost btn-sm text-xl text-base-content/60"
						aria-label={t('common.close', 'Close')}
						data-testid="modal-close-btn"
						onclick={close}>×</button
					>
				</header>
			{/if}
			<div class="overflow-auto p-5">
				{@render children?.()}
			</div>
			{#if footer}
				<footer class="modal-action mt-0 justify-end gap-2 border-t border-base-300 px-5 py-4">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
