<script lang="ts">
  import { t } from "svelte-i18n";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import { getFolder } from "$lib/api/sdk.gen";
  import type { FolderDto } from "$lib/api/types.gen";

  let {
    currentFolderId,
  }: {
    currentFolderId: string | null;
  } = $props();

  interface BreadcrumbItem {
    id: string | null;
    name: string;
  }

  let breadcrumbPath = $state<BreadcrumbItem[]>([]);
  let isLoading = $state(false);

  // Build breadcrumb path when folder changes
  $effect(() => {
    buildBreadcrumbPath(currentFolderId);
  });

  async function buildBreadcrumbPath(folderId: string | null) {
    if (!folderId) {
      breadcrumbPath = [];
      return;
    }

    isLoading = true;
    const path: BreadcrumbItem[] = [];
    let currentId: string | null = folderId;

    try {
      // Traverse up the folder hierarchy
      while (currentId) {
        const { data: folder, error } = await getFolder({ path: { id: currentId } });
        
        if (error || !folder) {
          console.error("Error fetching folder:", error);
          break;
        }

        path.unshift({ id: folder.id, name: folder.name });
        currentId = folder.parent_id || null;
      }

      breadcrumbPath = path;
    } catch (err) {
      console.error("Error building breadcrumb path:", err);
      breadcrumbPath = [];
    } finally {
      isLoading = false;
    }
  }

  // Generate the href for a breadcrumb item
  function getBreadcrumbHref(id: string | null): string {
    return id ? `/files/${id}` : "/files";
  }
</script>

<Breadcrumb.Root>
  <Breadcrumb.List>
    <!-- Home/Root always shown -->
    <Breadcrumb.Item>
      {#if currentFolderId === null}
        <Breadcrumb.Page>
          {$t("breadcrumb.home") || "Home"}
        </Breadcrumb.Page>
      {:else}
        <Breadcrumb.Link href="/files">
          {$t("breadcrumb.home") || "Home"}
        </Breadcrumb.Link>
      {/if}
    </Breadcrumb.Item>

    <!-- Folder path items -->
    {#if isLoading}
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page class="text-muted-foreground">...</Breadcrumb.Page>
      </Breadcrumb.Item>
    {:else}
      {#each breadcrumbPath as item, index (item.id)}
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          {#if index === breadcrumbPath.length - 1}
            <!-- Last item (current folder) is not a link -->
            <Breadcrumb.Page>{item.name}</Breadcrumb.Page>
          {:else}
            <Breadcrumb.Link href={getBreadcrumbHref(item.id)}>
              {item.name}
            </Breadcrumb.Link>
          {/if}
        </Breadcrumb.Item>
      {/each}
    {/if}
  </Breadcrumb.List>
</Breadcrumb.Root>
