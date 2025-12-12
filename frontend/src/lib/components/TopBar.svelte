<script lang="ts">
    import { t, locale } from 'svelte-i18n';
    import { auth } from '$lib/stores/auth';
    import { Search, LogOut } from 'lucide-svelte';

    let searchQuery = $state("");

    function handleSearch() {
        console.log('Search:', searchQuery);
    }

    function handleLogout() {
        auth.logout();
    }

    function toggleLanguage() {
        const next = $locale === 'es' ? 'en' : 'es';
        locale.set(next);
    }
</script>

<div class="flex h-[70px] w-full items-center justify-between border-b border-[#e6e6e6] bg-white px-[30px]">
    <div class="relative flex max-w-[500px] flex-grow items-center mr-5">
        <Search class="absolute left-4 text-[#8895a7]" size={18} />
        <input
            type="text"
            placeholder={$t('actions.search')}
            bind:value={searchQuery}
            class="h-10 w-full rounded-full border-none bg-[#f0f3f7] py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#ff5e3a]"
        >
        <button 
            id="search-button" 
            class="ml-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-[#ff5e3a] text-white transition hover:bg-[#e64a29]" 
            onclick={handleSearch} 
            aria-label={$t('actions.search')}
        >
            <Search size={16} />
        </button>
    </div>

    <div class="flex items-center">
        <button
            id="language-selector"
            class="mr-4 flex cursor-pointer items-center rounded-md bg-[#f0f3f7] px-3 py-1.5 text-sm"
            onclick={toggleLanguage}
            type="button"
        >
            {$locale?.toUpperCase() || 'EN'}
            <span class="ml-1.5 text-[8px] text-[#718096]">▼</span>
        </button>
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff5e3a] font-bold text-white">MR</div>
        <div
            id="logout-btn"
            class="ml-4 cursor-pointer text-[#64748b] transition-colors hover:text-[#ff5e3a]"
            title={$t('auth.logout') || 'Logout'}
            onclick={handleLogout}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && handleLogout()}
        >
            <LogOut size={18} />
        </div>
    </div>
</div>
