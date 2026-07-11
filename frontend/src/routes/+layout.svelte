<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// The SPA talks to its own backend on the same origin — data is cheap
				// to refetch but rarely changes underneath a single user session.
				staleTime: 30_000,
				retry: 1
			}
		}
	});

	onMount(() => {
		// The boot splash painted by app.html is obsolete once the app mounts.
		document.getElementById('app-splash')?.remove();
	});
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
