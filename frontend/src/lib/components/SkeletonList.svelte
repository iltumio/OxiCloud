<script lang="ts">
	import { files as filesStore } from '$lib/stores/files.svelte';

	interface Props {
		/** Number of placeholder cards/rows to render (default 6). */
		count?: number;
	}

	let { count = 6 }: Props = $props();

	const placeholders = $derived(Array.from({ length: count }, (_, i) => i));
</script>

{#if filesStore.viewMode === 'grid'}
	<div
		class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 min-[641px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] min-[641px]:gap-5"
		aria-hidden="true"
	>
		{#each placeholders as i (i)}
			<div
				class="border-base-300 flex min-h-40 w-full flex-col items-center gap-2 rounded-2xl border p-3"
			>
				<div class="skeleton h-[70px] w-[100px] rounded-lg"></div>
				<div class="skeleton h-3 w-3/5"></div>
				<div class="skeleton h-3 w-2/5"></div>
			</div>
		{/each}
	</div>
{:else}
	<div class="flex flex-col" aria-hidden="true">
		{#each placeholders as i (i)}
			<div class="border-base-300/50 flex items-center gap-3 border-b px-4 py-3">
				<div class="skeleton h-10 w-10 rounded-lg"></div>
				<div class="skeleton h-3 w-2/5"></div>
				<div class="skeleton h-3 w-1/5"></div>
			</div>
		{/each}
	</div>
{/if}
