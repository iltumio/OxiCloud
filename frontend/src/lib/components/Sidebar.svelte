<script lang="ts">
    import { page } from '$app/stores';
    import { t } from 'svelte-i18n';
    import { Folder, Share2, Clock, Star, Trash2 } from 'lucide-svelte';
</script>

<div class="flex h-full w-[250px] shrink-0 flex-col bg-[#2a3042] text-white">
    <div class="mb-5 flex items-center p-5">
        <div class="mr-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ff5e3a]">
            <svg viewBox="0 0 500 500" class="h-6 w-6 fill-white">
                <path d="M345 310c32 0 58-26 58-58s-26-58-58-58c-6.2 0-12 0.9-17.5 2.7C318 166 289 143 255 143c-34.3 0-63.1 22.6-73 53.7C176.9 195.7 171 195 165 195c-32 0-58 26-58 58s26 58 58 58h180z"/>
            </svg>
        </div>
        <div class="text-lg font-bold text-white">OxiCloud</div>
    </div>

    <div class="flex flex-grow flex-col px-4">
        <a href="/" class="mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-white transition-colors hover:bg-[#3a4157]" class:bg-[#374e65]={$page.url.pathname === '/'}>
            <Folder size={18} class="mr-3" />
            <span>{$t('nav.files')}</span>
        </a>
        <a href="/shared" class="mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-white transition-colors hover:bg-[#3a4157]" class:bg-[#374e65]={$page.url.pathname.startsWith('/shared')}>
            <Share2 size={18} class="mr-3" />
            <span>{$t('nav.shared')}</span>
        </a>
        <a href="/recent" class="mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-white transition-colors hover:bg-[#3a4157]" class:bg-[#374e65]={$page.url.pathname.startsWith('/recent')}>
            <Clock size={18} class="mr-3" />
            <span>{$t('nav.recent')}</span>
        </a>
        <a href="/favorites" class="mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-white transition-colors hover:bg-[#3a4157]" class:bg-[#374e65]={$page.url.pathname.startsWith('/favorites')}>
            <Star size={18} class="mr-3" />
            <span>{$t('nav.favorites')}</span>
        </a>
        <a href="/trash" class="mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-white transition-colors hover:bg-[#3a4157]" class:bg-[#374e65]={$page.url.pathname.startsWith('/trash')}>
            <Trash2 size={18} class="mr-3" />
            <span>{$t('nav.trash')}</span>
        </a>
    </div>

    <div class="m-4 rounded-lg bg-[#374e65] p-4">
        <div class="mb-2 text-center text-sm">Almacenamiento</div>
        <div class="mb-2 h-2.5 overflow-hidden rounded-full bg-[#6b7e8f]">
            <div class="h-full w-0 bg-[#ff5e3a] transition-all"></div>
        </div>
        <div class="text-center text-xs text-gray-100">Calculando...</div>
    </div>
</div>
