<script lang="ts">
	// Full-screen status layout shared by the Nextcloud login-flow terminal
	// pages (success / error). Not a route: SvelteKit ignores files in routes/
	// that don't start with `+`.
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		icon: string;
		/** daisyUI semantic color class for the icon, e.g. "text-success". */
		iconClass: string;
		title: string;
		message: string;
		actionLabel: string;
		actionTestid: string;
		onaction: () => void;
	}

	let { icon, iconClass, title, message, actionLabel, actionTestid, onaction }: Props = $props();
</script>

<main
	class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-base-200 px-4 py-8 text-center"
>
	<Icon name={icon} class="text-5xl {iconClass}" />
	<h1 class="text-2xl font-bold">{title}</h1>
	<p class="text-base-content/70">{message}</p>
	<button type="button" class="btn btn-primary mt-2" data-testid={actionTestid} onclick={onaction}>
		{actionLabel}
	</button>
</main>
