<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import FileIcon from "./FileIcon.svelte";
  import { formatSize, formatDate } from "$lib/utils";
  import { t } from "svelte-i18n";

  let {
    files,
    onFileClick,
  }: { files: FileItem[]; onFileClick: (file: FileItem) => void } = $props();
</script>

<div
  class="w-full overflow-hidden rounded-lg bg-white shadow-sm"
  id="files-list-view"
>
  <div
    class="grid grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr] border-b border-[#e0e6ed] bg-[#f8f9fa] p-4 font-semibold text-[#2d3748]"
  >
    <div>{$t("files.name")}</div>
    <div>{$t("files.type")}</div>
    <div>{$t("files.size")}</div>
    <div>{$t("files.modified")}</div>
  </div>
  {#each files as file (file.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="grid cursor-pointer grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr] items-center border-b border-[#f0f0f0] bg-white p-3 hover:bg-[#f0f8ff] transition-colors"
      onclick={() => onFileClick(file)}
    >
      <div class="flex items-center gap-3">
        <FileIcon {file} size={18} />
        {file.name}
      </div>
      <div class="text-sm font-medium text-[#4b5563]">
        {file.is_folder
          ? $t("files.file_types.folder")
          : file.extension || "File"}
      </div>
      <div class="text-right text-sm text-[#718096] pr-4">
        {file.is_folder ? "-" : formatSize(file.size)}
      </div>
      <div class="text-sm text-[#718096]">
        {formatDate(file.updated_at)}
      </div>
    </div>
  {/each}
</div>
