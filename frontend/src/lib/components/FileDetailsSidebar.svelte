<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import { FileText, Calendar, HardDrive, Hash, Type, X } from "lucide-svelte";
  import { formatSize } from "$lib/utils";
  import { cn } from "$lib/utils";
  import { Button } from "./ui/button";
  import { fly } from "svelte/transition";

  let {
    file,
    open = $bindable(false),
  }: {
    file: FileItem | null;
    open?: boolean;
  } = $props();

  function close() {
    open = false;
  }

  // Format timestamp to readable date
  function formatTimestamp(timestamp: string | number): string {
    if (!timestamp) return "-";
    let date: Date;
    if (typeof timestamp === "number") {
      // Check if seconds or milliseconds (10 billion seconds is year 2286)
      if (timestamp < 10000000000) {
        date = new Date(timestamp * 1000);
      } else {
        date = new Date(timestamp);
      }
    } else {
      date = new Date(timestamp);
    }
    return date.toLocaleString();
  }

  // Extract file type from mime type
  function getFileType(mimeType?: string): string {
    if (!mimeType) return "Unknown";
    const parts = mimeType.split("/");
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
</script>

{#if open && file}
  <aside
    class="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-background border-l shadow-lg overflow-y-auto"
    transition:fly={{ x: 400, duration: 300 }}
    data-slot="file-details-sidebar"
  >
    <div class="flex flex-col h-full p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold">File Details</h2>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 shrink-0"
          onclick={close}
        >
          <X size={18} />
          <span class="sr-only">Close</span>
        </Button>
      </div>

      <!-- File Icon and Name -->
      <div class="flex items-center gap-4 pb-4 border-b">
        <div
          class={cn(
            "flex h-16 w-16 items-center justify-center rounded-lg shrink-0",
            file.is_folder ? "bg-yellow-100 dark:bg-yellow-900/20" : "bg-muted"
          )}
        >
          <FileText
            class={cn(
              "h-8 w-8",
              file.is_folder ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"
            )}
          />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold truncate" title={file.name}>
            {file.name}
          </h3>
          <p class="text-sm text-muted-foreground">
            {file.is_folder ? "Folder" : "File"}
          </p>
        </div>
      </div>

      <!-- File Information -->
      <div class="space-y-4 mt-6">
        <h4 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Information
        </h4>

        <!-- File Type -->
        <div class="flex items-start gap-3">
          <Type class="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground">File Type</p>
            <p class="text-sm font-medium">
              {file.mime_type || file.type || getFileType(file.mime_type)}
            </p>
            {#if file.extension}
              <p class="text-xs text-muted-foreground">.{file.extension}</p>
            {/if}
          </div>
        </div>

        <!-- Size -->
        {#if !file.is_folder}
          <div class="flex items-start gap-3">
            <HardDrive class="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm text-muted-foreground">Size</p>
              <p class="text-sm font-medium">
                {formatSize(file.size)}
              </p>
              <p class="text-xs text-muted-foreground">{file.size.toLocaleString()} bytes</p>
            </div>
          </div>
        {/if}

        <!-- Modified Date -->
        <div class="flex items-start gap-3">
          <Calendar class="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground">Last Modified</p>
            <p class="text-sm font-medium">
              {formatTimestamp(file.updated_at)}
            </p>
          </div>
        </div>

        <!-- File ID -->
        <div class="flex items-start gap-3">
          <Hash class="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground">File ID</p>
            <p
              class="text-sm font-mono break-all"
              title={file.id}
            >
              {file.id}
            </p>
          </div>
        </div>

        <!-- CID (Content Identifier) - Placeholder for now -->
        <div class="flex items-start gap-3">
          <Hash class="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm text-muted-foreground">CID</p>
            <p class="text-sm font-mono text-muted-foreground italic">
              Not available
            </p>
          </div>
        </div>
      </div>
    </div>
  </aside>
{/if}

