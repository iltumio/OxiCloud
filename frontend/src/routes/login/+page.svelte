<script lang="ts">
    import { goto } from '$app/navigation';
    import { t } from 'svelte-i18n';
    import { auth } from '$lib/stores/auth';

    let username = $state('');
    let password = $state('');
    let error = $state('');
    let isLoading = $state(false);

    async function handleLogin() {
        isLoading = true;
        error = '';

        const success = await auth.login(username, password);
        isLoading = false;

        if (success) {
            goto('/');
        } else {
            const unsubscribe = auth.subscribe(state => {
                if (state.error) error = state.error;
            });
            unsubscribe();
        }
    }
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
    <div class="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <div class="mx-auto mb-4 h-20 w-20">
            <svg viewBox="0 0 500 500" class="h-full w-full">
                <path d="M345 310c32 0 58-26 58-58s-26-58-58-58c-6.2 0-12 0.9-17.5 2.7C318 166 289 143 255 143c-34.3 0-63.1 22.6-73 53.7C176.9 195.7 171 195 165 195c-32 0-58 26-58 58s26 58 58 58h180z" fill="#007bff"/>
            </svg>
        </div>
        <h1 class="mb-8 text-center text-2xl font-bold text-gray-800">{$t('app.title')}</h1>

        {#if error}
            <div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <div class="mb-4">
                <label for="username" class="mb-2 block text-sm font-medium text-gray-700">{$t('auth.username')}</label>
                <input 
                    type="text" 
                    id="username" 
                    placeholder={$t('auth.username_placeholder')} 
                    bind:value={username} 
                    required 
                    disabled={isLoading}
                    class="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
            </div>

            <div class="mb-6">
                <label for="password" class="mb-2 block text-sm font-medium text-gray-700">{$t('auth.password')}</label>
                <input 
                    type="password" 
                    id="password" 
                    placeholder={$t('auth.password_placeholder')} 
                    bind:value={password} 
                    required 
                    disabled={isLoading}
                    class="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
            </div>

            <button 
                type="submit" 
                disabled={isLoading}
                class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
                {#if isLoading}
                    Loading...
                {:else}
                    {$t('auth.login_button')}
                {/if}
            </button>
        </form>
    </div>
</div>
