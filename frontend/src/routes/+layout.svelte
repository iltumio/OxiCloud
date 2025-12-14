<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { auth } from '$lib/stores/auth';
    import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnWindowFocus: false,
                retry: 1
            }
        }
    });

    let { children } = $props();

    onMount(async () => {
        auth.init();
    });
</script>

<svelte:head>
    <link rel="icon" href="/favicon.ico" />
</svelte:head>

<QueryClientProvider client={queryClient}>
    {@render children()}
</QueryClientProvider>
