<script lang="ts">
  import { page } from "$app/stores";
  import { t } from "svelte-i18n";
  import { Folder, Share2, Clock, Star, Trash2 } from "lucide-svelte";
  import { createUserQuery } from "$lib/queries";
  import { Card, CardContent, CardHeader } from "$lib/components/ui/card";
  import { Progress } from "$lib/components/ui/progress";
  import { cn } from "$lib/utils";

  const userQuery = createUserQuery();

  let user = $derived(userQuery.data);
  let storagePercentage = $derived.by(() => {
    if (!user || !user.storage_quota_bytes) return 0;
    return Math.min(
      100,
      (user.storage_used_bytes / user.storage_quota_bytes) * 100
    );
  });

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
</script>

<aside class="flex h-full w-[250px] shrink-0 flex-col border-r bg-card">
  <div class="mb-5 flex items-center p-5">
    <div
      class="mr-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-primary"
    >
      <svg viewBox="0 0 500 500" class="h-6 w-6 fill-primary-foreground">
        <path
          d="M345 310c32 0 58-26 58-58s-26-58-58-58c-6.2 0-12 0.9-17.5 2.7C318 166 289 143 255 143c-34.3 0-63.1 22.6-73 53.7C176.9 195.7 171 195 165 195c-32 0-58 26-58 58s26 58 58 58h180z"
        />
      </svg>
    </div>
    <div class="text-lg font-bold text-foreground">OxiCloud</div>
  </div>

  <nav class="flex grow flex-col px-4">
    <a
      href="/"
      class={cn(
        "mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        $page.url.pathname === "/" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <Folder size={18} class="mr-3" />
      <span>{$t("nav.files")}</span>
    </a>
    <a
      href="/shared"
      class={cn(
        "mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        $page.url.pathname.startsWith("/shared") ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <Share2 size={18} class="mr-3" />
      <span>{$t("nav.shared")}</span>
    </a>
    <a
      href="/recent"
      class={cn(
        "mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        $page.url.pathname.startsWith("/recent") ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <Clock size={18} class="mr-3" />
      <span>{$t("nav.recent")}</span>
    </a>
    <a
      href="/favorites"
      class={cn(
        "mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        $page.url.pathname.startsWith("/favorites") ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <Star size={18} class="mr-3" />
      <span>{$t("nav.favorites")}</span>
    </a>
    <a
      href="/trash"
      class={cn(
        "mb-1 flex cursor-pointer items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        $page.url.pathname.startsWith("/trash") ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <Trash2 size={18} class="mr-3" />
      <span>{$t("nav.trash")}</span>
    </a>
  </nav>

  <Card class="m-4">
    <CardHeader class="pb-2">
      <div class="text-center text-sm font-medium">{$t("nav.storage") || "Storage"}</div>
    </CardHeader>
    <CardContent class="space-y-2">
      <Progress value={storagePercentage} class="h-2" />
      <div class="text-center text-xs text-muted-foreground">
        {#if user}
          {formatBytes(user.storage_used_bytes)} / {formatBytes(
            user.storage_quota_bytes
          )}
        {:else}
          Calculating...
        {/if}
      </div>
    </CardContent>
  </Card>
</aside>
