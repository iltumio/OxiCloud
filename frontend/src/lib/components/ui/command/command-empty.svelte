<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";

	let {
		class: className,
		children,
	}: {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<CommandPrimitive.Empty
	class={cn("py-6 text-center text-sm", className)}
>
	{@render children?.()}
</CommandPrimitive.Empty>
