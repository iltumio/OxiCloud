<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import FileIcon from "./FileIcon.svelte";
  import { formatSize } from "$lib/utils";

  let {
    files,
    onFileClick,
  }: { files: FileItem[]; onFileClick: (file: FileItem) => void } = $props();
</script>

<div
  class="grid gap-5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
  id="files-grid"
>
  {#each files as file (file.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex flex-col items-center cursor-pointer rounded-lg bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md border border-transparent hover:border-gray-100"
      onclick={() => onFileClick(file)}
    >
      <div
        class="mb-2.5 flex h-[70px] w-[100px] items-center justify-center rounded-lg {file.is_folder
          ? 'bg-[#ffeaa7]/20'
          : 'bg-gray-100'}"
      >
        <FileIcon {file} size={32} />
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
