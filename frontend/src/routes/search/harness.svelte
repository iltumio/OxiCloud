<script lang="ts">
	/**
	 * Test-only wrapper: the search page reads its QueryClient from context
	 * (provided by the root layout in the app), so unit tests mount the page
	 * through this harness. Not a route — SvelteKit ignores non-`+` files.
	 */
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import Page from './+page.svelte';

	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
</script>

<QueryClientProvider {client}><Page /></QueryClientProvider>
