<script lang="ts">
  import { t, locale } from "svelte-i18n";
  import { auth } from "$lib/stores/auth";
  import { openCommandPalette } from "$lib/stores/commandPalette";
  import { Search, LogOut } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { browser } from "$app/environment";

  const isMac = browser ? navigator.platform.toUpperCase().indexOf("MAC") >= 0 : true;

  function handleLogout() {
    auth.logout();
  }

  function setLanguage(lang: string) {
    locale.set(lang);
  }
</script>

<div
  class="flex h-[70px] w-full items-center justify-between border-b bg-background px-[30px]"
>
  <button
    class="relative flex max-w-[500px] grow items-center mr-5 h-10 rounded-full bg-muted px-4 text-sm text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer"
    onclick={openCommandPalette}
  >
    <Search class="mr-2" size={18} />
    <span class="grow text-left">{$t("actions.search") || "Search..."}</span>
    <kbd class="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
      {#if isMac}
        <span class="text-xs">⌘</span>K
      {:else}
        <span class="text-xs">Ctrl</span>K
      {/if}
    </kbd>
  </button>

  <div class="flex items-center gap-4">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            variant="secondary"
            class="rounded-md px-3 py-1.5 text-sm h-auto"
            {...props}
          >
            {$locale?.toUpperCase() || "EN"}
            <span class="ml-1.5 text-[8px] text-muted-foreground">▼</span>
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onclick={() => setLanguage("en")}
          >English</DropdownMenu.Item
        >
        <DropdownMenu.Item onclick={() => setLanguage("es")}
          >Español</DropdownMenu.Item
        >
        <DropdownMenu.Item onclick={() => setLanguage("zh")}
          >中文</DropdownMenu.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            variant="ghost"
            class="relative h-10 w-10 rounded-full p-0"
            {...props}
          >
            <Avatar>
              <AvatarFallback class="bg-primary text-primary-foreground font-bold"
                >MR</AvatarFallback
              >
            </Avatar>
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Label>My Account</DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={handleLogout}>
          <LogOut class="mr-2 h-4 w-4" />
          <span>{$t("auth.logout") || "Logout"}</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
