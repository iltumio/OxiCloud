<script lang="ts">
  import { t } from "svelte-i18n";
  import { createFilesQuery, type FileItem, queryKeys } from "$lib/queries";
  import { useQueryClient } from "@tanstack/svelte-query";
  import { apiFetch } from "$lib/api";
  import { Grid, List, CloudUpload, Loader, FolderOpen } from "lucide-svelte";
  import FileGrid from "$lib/components/FileGrid.svelte";
  import FileList from "$lib/components/FileList.svelte";
  import FileActions from "$lib/components/FileActions.svelte";
  import FileBreadcrumb from "$lib/components/FileBreadcrumb.svelte";
  import { Button } from "$lib/components/ui/button";

  let viewMode = $state("grid"); // 'grid' or 'list'
  let currentFolderId = $state<string | null>(null);
  let isDragging = $state(false);

  const queryClient = useQueryClient();

  function setView(mode: "grid" | "list") {
    viewMode = mode;
  }

  const query = createFilesQuery(() => currentFolderId);

  let files = $derived(query.data ?? []);
  let isLoading = $derived(query.isLoading);

  async function uploadFiles(filesToUpload: File[]) {
    // Process uploads
    for (const file of filesToUpload) {
      const formData = new FormData();
      formData.append("file", file);

      if (currentFolderId) {
        formData.append("folder_id", currentFolderId);
      }

      try {
        console.log(`Uploading ${file.name}...`);

        const response = await apiFetch("/files/upload", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          console.log(`Uploaded ${file.name} successfully`);
        } else {
          console.error(`Failed to upload ${file.name}`);
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
      }
    }

    // Refresh file list
    queryClient.invalidateQueries({
      queryKey: queryKeys.files(currentFolderId),
    });
  }

  function handleCreateFolder(name: string) {
    // TODO: Implement create folder API call
    console.log("Create folder:", name);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(event.dataTransfer.files));
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    if (
      event.clientY === 0 ||
      event.clientX === 0 ||
      event.relatedTarget === null
    ) {
      isDragging = false;
    }
  }

  function handleItemClick(item: FileItem) {
    if (item.is_folder) {
      currentFolderId = item.id;
    } else {
      console.log("File clicked:", item.name);
      // TODO: Implement file viewer
    }
  }

  function handleNavigate(id: string | null) {
    currentFolderId = id;
  }
</script>

<svelte:window
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
/>

<h1 class="mb-5 text-2xl font-bold text-[#2d3748]">{$t("nav.files")}</h1>

<div class="mb-5 flex justify-between items-center">
  <FileActions onUpload={uploadFiles} onCreateFolder={handleCreateFolder} />

  <div class="flex overflow-hidden rounded-lg bg-[#f0f3f7] p-1 gap-1">
    <Button
      variant={viewMode === "grid" ? "secondary" : "ghost"}
      size="icon"
      class="h-8 w-8 rounded-md"
      onclick={() => setView("grid")}
      title="Grid View"
    >
      <Grid size={16} />
    </Button>
    <Button
      variant={viewMode === "list" ? "secondary" : "ghost"}
      size="icon"
      class="h-8 w-8 rounded-md"
      onclick={() => setView("list")}
      title="List View"
    >
      <List size={16} />
    </Button>
  </div>
</div>

<div
  class="my-5 border-2 border-dashed border-[#ddd] p-5 text-center text-[#666] rounded-lg bg-white/50"
  class:hidden={!isDragging}
  id="dropzone"
>
  <CloudUpload size={32} class="mx-auto mb-2 text-gray-400" />
  <p>{$t("dropzone.drag_files")}</p>
</div>

<div class="mb-4">
  <FileBreadcrumb {currentFolderId} onNavigate={handleNavigate} />
</div>

<!-- Files Container -->
<div>
  {#if isLoading}
    <div class="flex items-center justify-center p-8 text-gray-500">
      <Loader class="mr-2 animate-spin" /> Loading...
    </div>
  {:else if files.length === 0}
    <div class="flex flex-col items-center justify-center p-12 text-gray-400">
      <FolderOpen size={48} class="mb-4" />
      <p>{$t("files.no_files") || "No files in this folder"}</p>
    </div>
  {:else if viewMode === "grid"}
    <FileGrid {files} onFileClick={handleItemClick} />
  {:else}
    <FileList {files} onFileClick={handleItemClick} />
  {/if}
</div>
