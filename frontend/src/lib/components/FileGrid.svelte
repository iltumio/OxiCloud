<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import FileIcon from "./FileIcon.svelte";
  import { formatSize } from "$lib/utils";
  import { Download, Trash2, Info, Eye } from "lucide-svelte";
  import { Button } from "./ui/button";
  import { Card, CardContent } from "./ui/card";
  import { fade } from "svelte/transition";
  import { cn } from "$lib/utils";

  let {
    files,
    onFileClick,
    onDownload,
    onDelete,
    onInfo,
    onPreview,
    selectedFileId,
  }: {
    files: FileItem[];
    onFileClick: (file: FileItem) => void;
    onDownload?: (file: FileItem) => void;
    onDelete?: (file: FileItem) => void;
    onInfo?: (file: FileItem) => void;
    onPreview?: (file: FileItem) => void;
    selectedFileId?: string | null;
  } = $props();

  let hoveredFileId = $state<string | null>(null);

  // Check if file is a PDF
  function isPdf(file: FileItem): boolean {
    if (file.is_folder) return false;
    return (
      file.mime_type === "application/pdf" ||
      file.extension?.toLowerCase() === "pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    );
  }
</script>

<div
  class="grid gap-5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
  id="files-grid"
>
  {#each files as file (file.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div data-file-id={file.id}>
      <Card
        class={cn(
          "group relative flex cursor-pointer flex-col items-center transition-all overflow-hidden",
          selectedFileId === file.id
            ? "-translate-y-0.5 shadow-md border-2 border-primary"
            : "hover:-translate-y-0.5 hover:shadow-md"
        )}
        onclick={() => onFileClick(file)}
        onmouseenter={() => {
          if (!file.is_folder) hoveredFileId = file.id;
        }}
        onmouseleave={() => {
          hoveredFileId = null;
        }}
      >
      <CardContent class="flex flex-col items-center p-5 w-full min-w-0">
        <div
          class={cn(
            "mb-2.5 relative flex h-[70px] w-[100px] items-center justify-center rounded-lg shrink-0",
            file.is_folder ? "bg-yellow-100 dark:bg-yellow-900/20" : "bg-muted"
          )}
        >
          <FileIcon {file} size={32} />
          
          <!-- Control bar overlay - only for files -->
          {#if !file.is_folder && hoveredFileId === file.id}
            <div
              class="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/60 backdrop-blur-sm px-1.5 flex-wrap"
              onclick={(e) => e.stopPropagation()}
              transition:fade={{ duration: 200 }}
            >
              {#if onInfo}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 shrink-0 text-white hover:bg-white/20"
                  onclick={(e) => {
                    e.stopPropagation();
                    onInfo(file);
                  }}
                  title="File Details"
                >
                  <Info size={14} />
                </Button>
              {/if}
              {#if onPreview && isPdf(file)}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 shrink-0 text-white hover:bg-white/20"
                  onclick={(e) => {
                    e.stopPropagation();
                    onPreview(file);
                  }}
                  title="Preview"
                >
                  <Eye size={14} />
                </Button>
              {/if}
              {#if onDownload}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 shrink-0 text-white hover:bg-white/20"
                  onclick={(e) => {
                    e.stopPropagation();
                    onDownload(file);
                  }}
                  title="Download"
                >
                  <Download size={14} />
                </Button>
              {/if}
              {#if onDelete}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 shrink-0 text-white hover:bg-destructive/80"
                  onclick={(e) => {
                    e.stopPropagation();
                    onDelete(file);
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </Button>
              {/if}
            </div>
          {/if}
        </div>
        <div
          class="mb-1 w-full px-1 text-center text-sm font-medium min-w-0"
          title={file.name}
        >
          <span class="block truncate">{file.name}</span>
        </div>
        <div class="text-center text-xs text-muted-foreground">
          {formatSize(file.size)}
        </div>
      </CardContent>
      </Card>
    </div>
  {/each}
</div>
