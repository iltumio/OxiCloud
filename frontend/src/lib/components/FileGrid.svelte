<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import FileIcon from "./FileIcon.svelte";
  import { formatSize } from "$lib/utils";
  import { Download, Trash2, Info, Eye } from "lucide-svelte";
  import { Button } from "./ui/button";
  import { fade } from "svelte/transition";

  let {
    files,
    onFileClick,
    onDownload,
    onDelete,
    onInfo,
    onPreview,
  }: {
    files: FileItem[];
    onFileClick: (file: FileItem) => void;
    onDownload?: (file: FileItem) => void;
    onDelete?: (file: FileItem) => void;
    onInfo?: (file: FileItem) => void;
    onPreview?: (file: FileItem) => void;
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
    <div
      class="group relative flex flex-col items-center cursor-pointer rounded-lg bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md border border-transparent hover:border-gray-100"
      onclick={() => onFileClick(file)}
      onmouseenter={() => {
        if (!file.is_folder) hoveredFileId = file.id;
      }}
      onmouseleave={() => {
        hoveredFileId = null;
      }}
    >
      <div
        class="mb-2.5 flex h-[70px] w-[100px] items-center justify-center rounded-lg relative {file.is_folder
          ? 'bg-[#ffeaa7]/20'
          : 'bg-gray-100'}"
      >
        <FileIcon {file} size={32} />
        
        <!-- Control bar overlay - only for files -->
        {#if !file.is_folder && hoveredFileId === file.id}
          <div
            class="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg px-1.5 whitespace-nowrap"
            onclick={(e) => e.stopPropagation()}
            transition:fade={{ duration: 200 }}
            style="width: max-content; min-width: 100px;"
          >
            {#if onInfo}
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 min-w-7 text-white hover:bg-white/20 hover:text-white transition-all flex-shrink-0 cursor-pointer"
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
                class="h-7 w-7 min-w-7 text-white hover:bg-white/20 hover:text-white transition-all flex-shrink-0 cursor-pointer"
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
                class="h-7 w-7 min-w-7 text-white hover:bg-white/20 hover:text-white transition-all flex-shrink-0 cursor-pointer"
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
                class="h-7 w-7 min-w-7 text-white hover:bg-red-500/80 hover:text-white transition-all flex-shrink-0 cursor-pointer"
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
        class="mb-1 text-center text-sm font-medium text-[#2d3748] truncate w-full"
        title={file.name}
      >
        {file.name}
      </div>
      <div class="text-center text-xs text-[#718096]">
        {formatSize(file.size)}
      </div>
    </div>
  {/each}
</div>
