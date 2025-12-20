<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { auth } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Loader } from 'lucide-svelte';

	let { children } = $props();

	$effect(() => {
		if (!$auth.isLoading && !$auth.accessToken) {
			goto('/login');
		}
	});
</script>

{#if $auth.isLoading}
	<div class="flex h-screen items-center justify-center">
        <Loader class="h-10 w-10 animate-spin text-primary" />
	</div>
{:else}
    <div class="flex h-screen overflow-hidden bg-background">
        <Sidebar />

        <div class="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main class="flex-1 overflow-y-auto p-5">
                {@render children()}
            </main>
        </div>
    </div>
{/if}
