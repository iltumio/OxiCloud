<script lang="ts">
  import { t } from "svelte-i18n";
  import { createFilesQuery, type FileItem, queryKeys } from "$lib/queries";
  import { useQueryClient, createMutation } from "@tanstack/svelte-query";
  import { uploadFile, createFolder, deleteFile } from "$lib/api/sdk.gen";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { Grid, List, CloudUpload, Loader, FolderOpen, AlertTriangle } from "lucide-svelte";
  import FileGrid from "$lib/components/FileGrid.svelte";
  import FileList from "$lib/components/FileList.svelte";
  import FileActions from "$lib/components/FileActions.svelte";
  import FileBreadcrumb from "$lib/components/FileBreadcrumb.svelte";
  import FileDetailsSidebar from "$lib/components/FileDetailsSidebar.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { getAccessToken } from "$lib/stores/auth";

  let viewMode = $state("grid"); // 'grid' or 'list'
  let isDragging = $state(false);
  let deleteDialogOpen = $state(false);
  let fileToDelete = $state<FileItem | null>(null);
  let fileDetailsSidebarOpen = $state(false);
  let fileToShow = $state<FileItem | null>(null);

  const queryClient = useQueryClient();

  // Initialize folder ID from URL on mount
  let currentFolderId = $state<string | null>(
    $page.url.searchParams.get("folder") ?? null
  );

  // Track the last URL we set to avoid feedback loops
  let lastSyncedUrl = $state<string | null>(currentFolderId);

  // Sync URL → state when browser navigation occurs (back/forward buttons)
  $effect(() => {
    const urlFolder = $page.url.searchParams.get("folder") ?? null;

    // Only update state if URL changed externally (browser back/forward)
    // and it's different from what we last synced
    if (urlFolder !== lastSyncedUrl) {
      currentFolderId = urlFolder;
      lastSyncedUrl = urlFolder;
    }
  });

  // Sync state → URL when currentFolderId changes from user interaction
  $effect(() => {
    const stateFolder = currentFolderId;

    // Skip if we already synced this value
    if (stateFolder === lastSyncedUrl) return;

    lastSyncedUrl = stateFolder;

    const next = new URL($page.url);
    if (stateFolder) {
      next.searchParams.set("folder", stateFolder);
    } else {
      next.searchParams.delete("folder");
    }

    goto(`${next.pathname}${next.search}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  });

  function setView(mode: "grid" | "list") {
    viewMode = mode;
  }

  const query = createFilesQuery(() => currentFolderId);

  let files = $derived(query.data ?? []);
  let isLoading = $derived(query.isLoading);

  // TanStack Query mutation for file uploads
  const uploadFileMut = createMutation(() => ({
    mutationFn: async (options: { file: File; folderId: string | null }) => {
      const { data } = await uploadFile({
        body: {
          file: options.file,
          folder_id: options.folderId,
        },
        throwOnError: true,
      });
      return data;
    },
  }));

  // TanStack Query mutation for folder creation
  const createFolderMut = createMutation(() => ({
    mutationFn: async (options: { name: string; parentId: string | null }) => {
      const { data } = await createFolder({
        body: {
          name: options.name,
          parent_id: options.parentId,
        },
        throwOnError: true,
      });
      return data;
    },
  }));

  // TanStack Query mutation for file deletion
  const deleteFileMut = createMutation(() => ({
    mutationFn: async (fileId: string) => {
      await deleteFile({
        path: { id: fileId },
        throwOnError: true,
      });
    },
  }));

  async function uploadFiles(filesToUpload: File[]) {
    // Use the current folder ID for uploads
    const folderIdToUse = currentFolderId;

    // Process uploads
    for (const file of filesToUpload) {
      try {
        if (import.meta.env.DEV) {
          console.log("Uploading", {
            name: file.name,
            folder_id: folderIdToUse ?? "root",
          });
        }

        await uploadFileMut.mutateAsync({
          file,
          folderId: folderIdToUse,
        });

        console.log(`Uploaded ${file.name} successfully`);
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
      }
    }

    // Refresh file list
    queryClient.invalidateQueries({
      queryKey: queryKeys.files(currentFolderId),
    });
  }

  async function handleCreateFolder(name: string) {
    try {
      await createFolderMut.mutateAsync({
        name,
        parentId: currentFolderId,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.files(currentFolderId),
      });
    } catch (error) {
      console.error("Error creating folder:", error);
    }
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

  async function downloadFile(file: FileItem) {
    try {
      // Get the base URL from environment or use relative path
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
      const token = getAccessToken();
      
      // Create download URL
      const url = `${baseUrl}/files/${file.id}`;
      
      // Fetch the file as blob
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      
      // Get the blob
      const blob = await response.blob();
      
      // Create a temporary URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Error downloading file:", error);
      // Fallback: try direct navigation
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
      window.open(`${baseUrl}/files/${file.id}`, "_blank");
    }
  }

  function openDeleteDialog(file: FileItem) {
    fileToDelete = file;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!fileToDelete) return;

    try {
      await deleteFileMut.mutateAsync(fileToDelete.id);
      // Refresh file list
      queryClient.invalidateQueries({
        queryKey: queryKeys.files(currentFolderId),
      });
      deleteDialogOpen = false;
      fileToDelete = null;
    } catch (error) {
      console.error("Error deleting file:", error);
      // Keep dialog open on error so user can retry
    }
  }

  function cancelDelete() {
    deleteDialogOpen = false;
    fileToDelete = null;
  }

  function openFileDetails(file: FileItem) {
    fileToShow = file;
    fileDetailsSidebarOpen = true;
  }

  async function previewFile(file: FileItem) {
    try {
      // Get the base URL from environment or use relative path
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
      const token = getAccessToken();
      
      // Create preview URL with inline parameter
      const url = `${baseUrl}/files/${file.id}?inline=true`;
      
      // Fetch the file as blob with authentication
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (!response.ok) {
        throw new Error(`Failed to preview file: ${response.statusText}`);
      }
      
      // Get the blob
      const blob = await response.blob();
      
      // Create a blob URL and open in new tab
      const blobUrl = URL.createObjectURL(blob);
      const newWindow = window.open(blobUrl, "_blank");
      
      // If popup was blocked, fallback to same window
      if (!newWindow) {
        window.location.href = blobUrl;
      }
      
      // Clean up the blob URL after a delay (give time for the tab to load)
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (error) {
      console.error("Error previewing file:", error);
      // Fallback: try direct navigation (may not work with auth)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
      window.open(`${baseUrl}/files/${file.id}?inline=true`, "_blank");
    }
  }

  function handleItemClick(item: FileItem) {
    if (item.is_folder) {
      currentFolderId = item.id;
    } else {
      // Download file when clicked
      downloadFile(item);
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
    <FileGrid
      {files}
      onFileClick={handleItemClick}
      onDownload={downloadFile}
      onDelete={openDeleteDialog}
      onInfo={openFileDetails}
      onPreview={previewFile}
    />
  {:else}
    <FileList {files} onFileClick={handleItemClick} />
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
          <AlertTriangle class="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <Dialog.Title class="text-lg font-semibold">
          {$t("dialogs.delete_file") || "Delete File"}
        </Dialog.Title>
      </div>
      <Dialog.Description class="pt-2 text-base">
        {$t("dialogs.delete_file_confirmation") ||
          `Are you sure you want to delete "${fileToDelete?.name}"? This action cannot be undone.`}
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="flex-row justify-end gap-2 sm:gap-0">
      <Button variant="outline" onclick={cancelDelete}>
        {$t("actions.cancel") || "Cancel"}
      </Button>
      <Button variant="destructive" onclick={confirmDelete}>
        {$t("actions.delete") || "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- File Details Sidebar -->
<FileDetailsSidebar file={fileToShow} bind:open={fileDetailsSidebarOpen} />
