<script lang="ts">
  import { t } from "svelte-i18n";
  import { createTrashQuery, type FileItem } from "$lib/queries";
  import {
    Grid,
    List,
    Loader,
    FolderOpen,
    Folder,
    Image,
    FileText,
    Video,
    Music,
    Archive,
    Code,
    FileSpreadsheet,
    File as FileIcon,
    Trash2,
    RotateCcw,
    X,
  } from "lucide-svelte";

  let viewMode = $state("grid"); // 'grid' or 'list'

  function setView(mode: "grid" | "list") {
    viewMode = mode;
  }

  const query = createTrashQuery();

  let files = $derived(query.data ?? []);
  let isLoading = $derived(query.isLoading);

  function handleRestore(item: FileItem) {
    console.log("Restore item:", item.name);
    // TODO: Implement restore
  }

  function handleDeletePermanently(item: FileItem) {
    console.log("Delete permanently:", item.name);
    // TODO: Implement delete permanently
  }

  function handleEmptyTrash() {
    console.log("Empty trash");
    // TODO: Implement empty trash
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDate(dateValue: string | number): string {
    if (!dateValue) return "-";
    let date: Date;
    if (typeof dateValue === "number") {
      if (dateValue < 10000000000) {
        date = new Date(dateValue * 1000);
      } else {
        date = new Date(dateValue);
      }
    } else {
      date = new Date(dateValue);
    }
    return date.toLocaleDateString();
  }

  function getFileIcon(file: FileItem) {
    if (file.is_folder) return Folder;

    const ext = file.extension || file.name.split(".").pop()?.toLowerCase();

    switch (ext) {
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "svg":
        return Image;
      case "pdf":
        return FileText;
      case "txt":
      case "md":
        return FileText;
      case "mp4":
      case "webm":
      case "mov":
        return Video;
      case "mp3":
      case "wav":
      case "ogg":
        return Music;
      case "zip":
      case "rar":
      case "7z":
      case "tar":
      case "gz":
        return Archive;
      case "js":
      case "ts":
      case "html":
      case "css":
      case "json":
      case "py":
      case "rs":
        return Code;
      case "doc":
      case "docx":
        return FileText;
      case "xls":
      case "xlsx":
        return FileSpreadsheet;
      case "ppt":
      case "pptx":
        return FileText;
      default:
        return FileIcon;
    }
  }
</script>

<h1 class="mb-5 text-2xl font-bold text-[#2d3748]">{$t("nav.trash")}</h1>

<div class="mb-5 flex justify-between">
  <div>
    {#if files.length > 0}
      <button
        class="flex cursor-pointer items-center gap-2 rounded-full border-none bg-red-500 px-5 py-2.5 text-sm text-white transition hover:bg-red-600"
        onclick={handleEmptyTrash}
      >
        <Trash2 size={16} />
        <span>{$t("trash.empty_trash") || "Empty Trash"}</span>
      </button>
    {/if}
  </div>

  <div class="flex overflow-hidden rounded-lg">
    <button
      class="cursor-pointer border-none bg-[#f0f3f7] px-4 py-2 hover:bg-[#e6e6e6]"
      class:bg-[#e6e6e6]={viewMode === "grid"}
      onclick={() => setView("grid")}
      title="Vista de cuadrícula"
    >
      <Grid size={16} />
    </button>
    <button
      class="cursor-pointer border-none bg-[#f0f3f7] px-4 py-2 hover:bg-[#e6e6e6]"
      class:bg-[#e6e6e6]={viewMode === "list"}
      onclick={() => setView("list")}
      title="Vista de lista"
    >
      <List size={16} />
    </button>
  </div>
</div>

<!-- Files Container -->
<div>
  {#if isLoading}
    <div class="flex items-center justify-center p-8 text-gray-500">
      <Loader class="mr-2 animate-spin" /> Loading...
    </div>
  {:else if files.length === 0}
    <div class="flex flex-col items-center justify-center p-12 text-gray-400">
      <Trash2 size={48} class="mb-4" />
      <p>{$t("trash.empty_state") || "Trash is empty"}</p>
    </div>
  {:else if viewMode === "grid"}
    <!-- Grid View -->
    <div
      class="grid gap-5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
      id="files-grid"
    >
      {#each files as file (file.id)}
        {@const Icon = getFileIcon(file)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="flex flex-col items-center rounded-lg bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md relative group"
          class:border-2={false}
          class:border-dashed={false}
          role="group"
        >
          <div
            class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              class="p-1 rounded-full bg-gray-100 hover:bg-blue-100 text-blue-600"
              title={$t("trash.restore") || "Restore"}
              onclick={() => handleRestore(file)}
            >
              <RotateCcw size={16} />
            </button>
            <button
              class="p-1 rounded-full bg-gray-100 hover:bg-red-100 text-red-600"
              title={$t("trash.delete_permanently") || "Delete Permanently"}
              onclick={() => handleDeletePermanently(file)}
            >
              <X size={16} />
            </button>
          </div>

          <div
            class="mb-2.5 flex h-[70px] w-[100px] items-center justify-center rounded-lg {file.is_folder
              ? 'bg-[#ffeaa7]'
              : 'bg-gray-100'}"
          >
            {#if !file.is_folder}
              <Icon size={32} class="text-gray-500" />
            {:else}
              <Folder size={32} class="text-yellow-500 fill-yellow-500" />
            {/if}
          </div>
          <div
            class="mb-1 text-center text-sm font-medium text-[#2d3748]"
            title={file.name}
          >
            {file.name}
          </div>
          <div class="text-center text-xs text-[#718096]">
            {formatDate(file.updated_at)}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- List View -->
    <div
      class="w-full overflow-hidden rounded-lg bg-white shadow-sm"
      id="files-list-view"
    >
      <div
        class="grid grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr_100px] border-b border-[#e0e6ed] bg-[#f8f9fa] p-4 font-semibold text-[#2d3748]"
      >
        <div>{$t("files.name")}</div>
        <div>{$t("files.type")}</div>
        <div>{$t("files.size")}</div>
        <div>{$t("trash.deleted_date") || "Deleted Date"}</div>
        <div class="text-center">{$t("trash.actions") || "Actions"}</div>
      </div>
      {#each files as file (file.id)}
        {@const Icon = getFileIcon(file)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="grid grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr_100px] items-center border-b border-[#f0f0f0] bg-white p-3 hover:bg-[#f0f8ff] transition-colors group"
          role="row"
        >
          <div class="flex items-center gap-3">
            <Icon
              size={18}
              class={file.is_folder
                ? "text-yellow-500 fill-yellow-500"
                : "text-gray-500"}
            />
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
          <div
            class="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              class="p-1 rounded text-blue-600 hover:bg-blue-50"
              title={$t("trash.restore") || "Restore"}
              onclick={() => handleRestore(file)}
            >
              <RotateCcw size={16} />
            </button>
            <button
              class="p-1 rounded text-red-600 hover:bg-red-50"
              title={$t("trash.delete_permanently") || "Delete Permanently"}
              onclick={() => handleDeletePermanently(file)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
