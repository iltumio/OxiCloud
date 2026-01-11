<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import FileIcon from "./FileIcon.svelte";
  import { formatSize, formatDate } from "$lib/utils";
  import { t } from "svelte-i18n";
  import { Heart } from "lucide-svelte";
  import { Button } from "./ui/button";
  import { cn } from "$lib/utils";
  import * as Table from "./ui/table";

  let {
    files,
    onFileClick,
    onToggleFavorite,
    favoriteIds = new Set(),
  }: {
    files: FileItem[];
    onFileClick: (file: FileItem) => void;
    onToggleFavorite?: (file: FileItem) => void;
    favoriteIds?: Set<string>;
  } = $props();
</script>

<div class="w-full overflow-hidden rounded-lg border bg-card" id="files-list-view">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>{$t("files.name")}</Table.Head>
        <Table.Head>{$t("files.type")}</Table.Head>
        <Table.Head>CID</Table.Head>
        <Table.Head class="text-right">{$t("files.size")}</Table.Head>
        <Table.Head>{$t("files.modified")}</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each files as file (file.id)}
        <Table.Row
          class="cursor-pointer"
          onclick={() => onFileClick(file)}
        >
          <Table.Cell>
            <div class="flex items-center gap-3">
              {#if onToggleFavorite}
                <Button
                  variant="ghost"
                  size="icon"
                  class={cn(
                    "h-6 w-6 shrink-0",
                    favoriteIds.has(file.id)
                      ? "text-red-500 hover:text-red-600"
                      : "text-muted-foreground hover:text-red-500"
                  )}
                  onclick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(file);
                  }}
                  title={favoriteIds.has(file.id) ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart
                    size={14}
                    fill={favoriteIds.has(file.id) ? "currentColor" : "none"}
                  />
                </Button>
              {/if}
              <FileIcon {file} size={18} />
              <span class="font-medium">{file.name}</span>
            </div>
          </Table.Cell>
          <Table.Cell>
            <span class="text-sm text-muted-foreground">
              {file.is_folder
                ? $t("files.file_types.folder")
                : file.extension || "File"}
            </span>
          </Table.Cell>
          <Table.Cell>
            {#if file.cid}
              <span class="text-xs text-muted-foreground font-mono" title={file.cid}>
                {file.cid.substring(0, 8)}...{file.cid.substring(file.cid.length - 8)}
              </span>
            {:else}
              <span class="text-xs text-muted-foreground">-</span>
            {/if}
          </Table.Cell>
          <Table.Cell class="text-right">
            <span class="text-sm text-muted-foreground">
              {file.is_folder ? "-" : formatSize(file.size)}
            </span>
          </Table.Cell>
          <Table.Cell>
            <span class="text-sm text-muted-foreground">
              {formatDate(file.updated_at)}
            </span>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>
