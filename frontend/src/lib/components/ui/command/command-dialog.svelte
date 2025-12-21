<script lang="ts">
	import { Dialog as DialogPrimitive, Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";
	import { Search } from "lucide-svelte";

	let {
		open = $bindable(false),
		onOpenChange,
		class: className,
		children,
		...restProps
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		class?: string;
		children?: Snippet;
	} = $props();

	function handleOpenChange(isOpen: boolean) {
		open = isOpen;
		onOpenChange?.(isOpen);
	}
</script>

<DialogPrimitive.Root bind:open onOpenChange={handleOpenChange} {...restProps}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<DialogPrimitive.Content
			class={cn(
				"bg-popover text-popover-foreground fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2",
				className
			)}
		>
			<CommandPrimitive.Root class="flex h-full w-full flex-col overflow-hidden">
				{@render children?.()}
			</CommandPrimitive.Root>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
