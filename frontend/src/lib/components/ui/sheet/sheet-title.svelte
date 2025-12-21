<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<DialogPrimitive.Title
	bind:ref
	data-slot="sheet-title"
	class={cn("text-lg font-semibold text-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</DialogPrimitive.Title>

