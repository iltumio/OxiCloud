<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import { Search } from "lucide-svelte";

	let {
		class: className,
		value = $bindable(""),
		placeholder = "",
		onkeydown,
	}: {
		class?: string;
		value?: string;
		placeholder?: string;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();
</script>

<div class="flex items-center border-b px-3" data-command-input-wrapper>
	<Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
	<CommandPrimitive.Input
		bind:value
		{placeholder}
		{onkeydown}
		class={cn(
			"placeholder:text-muted-foreground flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
	/>
</div>
