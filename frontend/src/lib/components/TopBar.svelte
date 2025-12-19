<script lang="ts">
  import { t, locale } from "svelte-i18n";
  import { auth } from "$lib/stores/auth";
  import { Search, LogOut } from "lucide-svelte";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";

  let searchQuery = $state("");

  function handleSearch() {
    console.log("Search:", searchQuery);
  }

  function handleLogout() {
    auth.logout();
  }

  function setLanguage(lang: string) {
    locale.set(lang);
  }
</script>

<div
  class="flex h-[70px] w-full items-center justify-between border-b border-[#e6e6e6] bg-white px-[30px]"
>
  <div class="relative flex max-w-[500px] grow items-center mr-5">
    <Search class="absolute left-4 text-[#8895a7] z-10" size={18} />
    <Input
      type="text"
      placeholder={$t("actions.search")}
      bind:value={searchQuery}
      class="h-10 w-full rounded-full bg-[#f0f3f7] border-none py-2.5 pl-10 pr-14 text-sm focus-visible:ring-1 focus-visible:ring-[#ff5e3a] shadow-none"
      onkeydown={(e: KeyboardEvent) => e.key === "Enter" && handleSearch()}
    />
    <Button
      size="icon"
      class="absolute right-1 top-0.5 h-9 w-9 rounded-full bg-[#ff5e3a] hover:bg-[#e64a29] text-white shadow-none"
      onclick={handleSearch}
      aria-label={$t("actions.search")}
    >
      <Search size={16} />
    </Button>
  </div>

  <div class="flex items-center gap-4">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            variant="ghost"
            class="rounded-md bg-[#f0f3f7] px-3 py-1.5 text-sm h-auto hover:bg-[#e2e8f0]"
            {...props}
          >
            {$locale?.toUpperCase() || "EN"}
            <span class="ml-1.5 text-[8px] text-[#718096]">▼</span>
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
              <AvatarFallback class="bg-[#ff5e3a] text-white font-bold"
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
