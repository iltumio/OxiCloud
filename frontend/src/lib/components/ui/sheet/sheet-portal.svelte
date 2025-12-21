<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<ComponentProps<DialogPrimitive.Portal>> = $props();
</script>

<DialogPrimitive.Portal bind:ref class={cn(className)} {...restProps} />

