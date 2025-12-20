<script lang="ts">
    import { goto } from '$app/navigation';
    import { t } from 'svelte-i18n';
    import { auth } from '$lib/stores/auth';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Button } from '$lib/components/ui/button';
    import { Loader } from 'lucide-svelte';

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

<div class="flex min-h-screen items-center justify-center bg-background p-4">
    <Card class="w-full max-w-sm">
        <CardHeader class="space-y-4">
            <div class="mx-auto h-20 w-20">
                <svg viewBox="0 0 500 500" class="h-full w-full">
                    <path d="M345 310c32 0 58-26 58-58s-26-58-58-58c-6.2 0-12 0.9-17.5 2.7C318 166 289 143 255 143c-34.3 0-63.1 22.6-73 53.7C176.9 195.7 171 195 165 195c-32 0-58 26-58 58s26 58 58 58h180z" fill="hsl(var(--primary))"/>
                </svg>
            </div>
            <CardTitle class="text-center text-2xl">{$t('app.title')}</CardTitle>
        </CardHeader>
        <CardContent>
            {#if error}
                <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                    {error}
                </div>
            {/if}

            <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4">
                <div class="space-y-2">
                    <Label for="username">{$t('auth.username')}</Label>
                    <Input 
                        type="text" 
                        id="username" 
                        placeholder={$t('auth.username_placeholder')} 
                        bind:value={username} 
                        required 
                        disabled={isLoading}
                    />
                </div>

                <div class="space-y-2">
                    <Label for="password">{$t('auth.password')}</Label>
                    <Input 
                        type="password" 
                        id="password" 
                        placeholder={$t('auth.password_placeholder')} 
                        bind:value={password} 
                        required 
                        disabled={isLoading}
                    />
                </div>

                <Button 
                    type="submit" 
                    disabled={isLoading}
                    class="w-full"
                >
                    {#if isLoading}
                        <Loader class="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                    {:else}
                        {$t('auth.login_button')}
                    {/if}
                </Button>
            </form>
        </CardContent>
    </Card>
</div>
