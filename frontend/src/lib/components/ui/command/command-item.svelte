<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";

	let {
		class: className,
		children,
		onSelect,
	}: {
		class?: string;
		children?: Snippet;
		onSelect?: () => void;
	} = $props();
</script>

<CommandPrimitive.Item
	{onSelect}
	class={cn(
		"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		className
	)}
>
	{@render children?.()}
</CommandPrimitive.Item>
