<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";

	let {
		class: className,
		heading,
		children,
	}: { 
		class?: string;
		heading?: string;
		children?: Snippet;
	} = $props();
</script>

<CommandPrimitive.Group
	class={cn(
		"text-foreground overflow-hidden p-1 [&_[data-command-group-heading]]:px-2 [&_[data-command-group-heading]]:py-1.5 [&_[data-command-group-heading]]:text-xs [&_[data-command-group-heading]]:font-medium [&_[data-command-group-heading]]:text-muted-foreground",
		className
	)}
>
	{#if heading}
		<CommandPrimitive.GroupHeading data-command-group-heading>
			{heading}
		</CommandPrimitive.GroupHeading>
	{/if}
	<CommandPrimitive.GroupItems>
		{@render children?.()}
	</CommandPrimitive.GroupItems>
</CommandPrimitive.Group>
