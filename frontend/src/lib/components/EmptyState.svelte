<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		/** Icon-registry name shown above the title (omit for a text-only state). */
		icon?: string;
		/** Primary line. */
		title?: string;
		/** Secondary explanatory line. */
		hint?: string;
		/** Error styling (danger-coloured icon) + assertive `role="alert"`. */
		error?: boolean;
		/** Extra content (e.g. a call-to-action button) rendered below the hint. */
		children?: Snippet;
	}

	let { icon, title, hint, error = false, children }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center"
	role={error ? 'alert' : undefined}
>
	{#if icon}
		<Icon name={icon} class="mb-2 text-5xl {error ? 'text-error' : 'text-base-content/30'}" />
	{/if}
	{#if title}<p class="text-base-content m-0 text-lg font-semibold">{title}</p>{/if}
	{#if hint}<p class="text-base-content/60 m-0 max-w-md text-sm">{hint}</p>{/if}
	{@render children?.()}
</div>
