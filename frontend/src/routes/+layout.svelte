<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { auth } from '$lib/stores/auth';

    let { children } = $props();

    onMount(async () => {
        auth.init();
    });
</script>

<svelte:head>
    <link rel="icon" href="/favicon.ico" />
</svelte:head>

{@render children()}
