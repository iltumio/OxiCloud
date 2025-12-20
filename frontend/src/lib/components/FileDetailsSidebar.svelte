<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import { X, FileText, Calendar, HardDrive, Hash, Type } from "lucide-svelte";
  import { Button } from "./ui/button";
  import { formatSize } from "$lib/utils";
  import { slide, fade } from "svelte/transition";

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
  <!-- Overlay -->
  <div
    class="fixed inset-0 bg-black/50 z-40"
    onclick={close}
    transition:fade={{ duration: 200 }}
  />

  <!-- Sidebar -->
  <aside
    class="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 overflow-y-auto"
    transition:slide={{ axis: "x", duration: 300 }}
  >
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b">
        <h2 class="text-xl font-semibold text-gray-900">File Details</h2>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={close}
        >
          <X size={20} />
        </Button>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6 space-y-6">
        <!-- File Icon and Name -->
        <div class="flex items-center gap-4 pb-4 border-b">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-lg {file.is_folder
              ? 'bg-yellow-100'
              : 'bg-gray-100'}"
          >
            {#if file.is_folder}
              <FileText class="h-8 w-8 text-yellow-600" />
            {:else}
              <FileText class="h-8 w-8 text-gray-600" />
            {/if}
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-gray-900 truncate" title={file.name}>
              {file.name}
            </h3>
            <p class="text-sm text-gray-500">
              {file.is_folder ? "Folder" : "File"}
            </p>
          </div>
        </div>

        <!-- File Information -->
        <div class="space-y-4">
          <h4 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Information
          </h4>

          <!-- File Type -->
          <div class="flex items-start gap-3">
            <Type class="h-5 w-5 text-gray-400 mt-0.5" />
            <div class="flex-1">
              <p class="text-sm text-gray-500">File Type</p>
              <p class="text-sm font-medium text-gray-900">
                {file.mime_type || file.type || getFileType(file.mime_type)}
              </p>
              {#if file.extension}
                <p class="text-xs text-gray-400">.{file.extension}</p>
              {/if}
            </div>
          </div>

          <!-- Size -->
          {#if !file.is_folder}
            <div class="flex items-start gap-3">
              <HardDrive class="h-5 w-5 text-gray-400 mt-0.5" />
              <div class="flex-1">
                <p class="text-sm text-gray-500">Size</p>
                <p class="text-sm font-medium text-gray-900">
                  {formatSize(file.size)}
                </p>
                <p class="text-xs text-gray-400">{file.size.toLocaleString()} bytes</p>
              </div>
            </div>
          {/if}

          <!-- Modified Date -->
          <div class="flex items-start gap-3">
            <Calendar class="h-5 w-5 text-gray-400 mt-0.5" />
            <div class="flex-1">
              <p class="text-sm text-gray-500">Last Modified</p>
              <p class="text-sm font-medium text-gray-900">
                {formatTimestamp(file.updated_at)}
              </p>
            </div>
          </div>

          <!-- File ID -->
          <div class="flex items-start gap-3">
            <Hash class="h-5 w-5 text-gray-400 mt-0.5" />
            <div class="flex-1">
              <p class="text-sm text-gray-500">File ID</p>
              <p
                class="text-sm font-mono text-gray-900 break-all"
                title={file.id}
              >
                {file.id}
              </p>
            </div>
          </div>

          <!-- CID (Content Identifier) - Placeholder for now -->
          <div class="flex items-start gap-3">
            <Hash class="h-5 w-5 text-gray-400 mt-0.5" />
            <div class="flex-1">
              <p class="text-sm text-gray-500">CID</p>
              <p class="text-sm font-mono text-gray-500 italic">
                Not available
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
{/if}

