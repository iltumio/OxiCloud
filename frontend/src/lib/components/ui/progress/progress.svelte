<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(0),
		max = 100,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		value?: number;
		max?: number;
	} = $props();

	let percentage = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div
	bind:this={ref}
	data-slot="progress"
	class={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={value}
	{...restProps}
>
	<div
		class="h-full bg-primary transition-all duration-300"
		style="width: {percentage}%"
	></div>
</div>

