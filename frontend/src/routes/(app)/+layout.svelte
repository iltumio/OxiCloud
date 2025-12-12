<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { auth } from '$lib/stores/auth';
	import { goto } from '$app/navigation';

	let { children } = $props();

	$effect(() => {
		if (!$auth.isLoading && !$auth.accessToken) {
			goto('/login');
		}
	});
</script>

{#if $auth.isLoading}
	<div class="flex h-screen items-center justify-center text-2xl text-[#007bff]">
        <!-- Use a lucide icon for spinner if available, or just text/svg -->
        <svg class="h-10 w-10 animate-spin" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
	</div>
{:else}
    <div class="flex h-screen overflow-hidden bg-[#f5f7fa]">
        <Sidebar />

        <div class="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <div class="flex-1 overflow-y-auto p-5">
                {@render children()}
            </div>
        </div>
    </div>
{/if}
