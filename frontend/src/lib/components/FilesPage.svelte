<script lang="ts">
  import { t } from "svelte-i18n";
  import { createFilesQuery, type FileItem, queryKeys } from "$lib/queries";
  import { useQueryClient, createMutation } from "@tanstack/svelte-query";
  import { uploadFile, createFolder, deleteFile } from "$lib/api/sdk.gen";
  import { goto } from "$app/navigation";
  import { Grid, List, CloudUpload, Loader, FolderOpen, AlertTriangle } from "lucide-svelte";
  import FileGrid from "$lib/components/FileGrid.svelte";
  import FileList from "$lib/components/FileList.svelte";
  import FileActions from "$lib/components/FileActions.svelte";
  import FileBreadcrumb from "$lib/components/FileBreadcrumb.svelte";
  import FileDetailsSidebar from "$lib/components/FileDetailsSidebar.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { getAccessToken } from "$lib/stores/auth";
  import { commandPaletteOpen, toggleCommandPalette, closeCommandPalette } from "$lib/stores/commandPalette";

  let { folderId }: { folderId: string | null } = $props();

  // Derive current folder ID from props
  let currentFolderId = $derived(folderId);

  let viewMode = $state("grid"); // 'grid' or 'list'
  let isDragging = $state(false);
  let deleteDialogOpen = $state(false);
  let fileToDelete = $state<FileItem | null>(null);
  let fileDetailsSidebarOpen = $state(false);
  let fileToShow = $state<FileItem | null>(null);
  let newFolderDialogOpen = $state(false);
  let newFolderName = $state("");
  let fileInputRef = $state<HTMLInputElement | null>(null);

  const queryClient = useQueryClient();

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
      // Navigate to folder using proper URL path
      goto(`/files/${item.id}`);
      // Close sidebar when navigating to folder
      fileDetailsSidebarOpen = false;
      fileToShow = null;
    } else {
      // Open sidebar with file details instead of downloading
      fileToShow = item;
      fileDetailsSidebarOpen = true;
    }
  }

  function handlePageClick(event: MouseEvent) {
    // Close sidebar if clicking on page background (not on cards, sidebar, or dialogs)
    const target = event.target as HTMLElement;
    const isCard = target.closest('[data-slot="card"]');
    const isSidebar = target.closest('[data-slot="file-details-sidebar"]');
    const isDialog = target.closest('[data-slot="dialog-content"]');
    const isDialogOverlay = target.closest('[data-slot="dialog-overlay"]');
    const isButton = target.closest('button');
    const isInput = target.closest('input');
    
    // Close sidebar if clicking outside of cards, sidebar, dialogs, and buttons
    if (!isCard && !isSidebar && !isDialog && !isDialogOverlay && !isButton && !isInput && fileDetailsSidebarOpen) {
      fileDetailsSidebarOpen = false;
      fileToShow = null;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Command palette shortcuts (Cmd/Ctrl + K)
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      toggleCommandPalette();
      return;
    }
    
    // Don't interfere with input fields (except for global shortcuts above)
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    
    // Escape closes the sidebar or command palette
    if (event.key === 'Escape') {
      if ($commandPaletteOpen) {
        event.preventDefault();
        closeCommandPalette();
        return;
      }
      if (fileDetailsSidebarOpen) {
        event.preventDefault();
        fileDetailsSidebarOpen = false;
        fileToShow = null;
        return;
      }
    }
    
    // Enter downloads the selected file
    if (event.key === 'Enter' && fileToShow && !fileToShow.is_folder) {
      event.preventDefault();
      downloadFile(fileToShow);
      return;
    }
    
    // Only handle arrow keys when sidebar is open (a file is selected)
    if (!fileDetailsSidebarOpen || !fileToShow) return;
    
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrowKeys.includes(event.key)) return;
    
    event.preventDefault();
    
    // Get only non-folder files for navigation
    const selectableFiles = files.filter(f => !f.is_folder);
    if (selectableFiles.length === 0) return;
    
    const currentIndex = selectableFiles.findIndex(f => f.id === fileToShow?.id);
    if (currentIndex === -1) return;
    
    // Calculate grid columns by checking the grid element
    const gridElement = document.getElementById('files-grid');
    let columns = 1;
    if (gridElement) {
      const gridStyle = window.getComputedStyle(gridElement);
      const gridTemplateColumns = gridStyle.getPropertyValue('grid-template-columns');
      columns = gridTemplateColumns.split(' ').length;
    }
    
    let newIndex = currentIndex;
    
    switch (event.key) {
      case 'ArrowLeft':
        newIndex = Math.max(0, currentIndex - 1);
        break;
      case 'ArrowRight':
        newIndex = Math.min(selectableFiles.length - 1, currentIndex + 1);
        break;
      case 'ArrowUp':
        newIndex = Math.max(0, currentIndex - columns);
        break;
      case 'ArrowDown':
        newIndex = Math.min(selectableFiles.length - 1, currentIndex + columns);
        break;
    }
    
    if (newIndex !== currentIndex && selectableFiles[newIndex]) {
      fileToShow = selectableFiles[newIndex];
      
      // Scroll the selected card into view
      setTimeout(() => {
        const selectedCard = document.querySelector(`[data-file-id="${selectableFiles[newIndex].id}"]`);
        if (selectedCard) {
          selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 0);
    }
  }

  // Command palette handlers
  function handleCommandUpload() {
    fileInputRef?.click();
  }

  function handleCommandNewFolder() {
    newFolderDialogOpen = true;
  }

  function handleCommandGoToFile(file: FileItem) {
    if (file.is_folder) {
      goto(`/files/${file.id}`);
    } else {
      fileToShow = file;
      fileDetailsSidebarOpen = true;
    }
  }

  function handleCommandSearch(query: string) {
    console.log("Search for:", query);
    // TODO: Implement search functionality
  }

  function handleNewFolderSubmit() {
    if (newFolderName.trim()) {
      handleCreateFolder(newFolderName.trim());
      newFolderDialogOpen = false;
      newFolderName = "";
    }
  }
</script>

<svelte:window
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={handlePageClick}
  onkeydown={handleKeyDown}
/>

<h1 class="mb-5 text-2xl font-bold">{$t("nav.files")}</h1>

<div class="mb-5 flex justify-between items-center">
  <FileActions onUpload={uploadFiles} onCreateFolder={handleCreateFolder} />

  <div class="flex overflow-hidden rounded-lg bg-muted p-1 gap-1">
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
  class="my-5 border-2 border-dashed border-border p-5 text-center text-muted-foreground rounded-lg bg-muted/50"
  class:hidden={!isDragging}
  id="dropzone"
>
  <CloudUpload size={32} class="mx-auto mb-2 text-muted-foreground" />
  <p>{$t("dropzone.drag_files")}</p>
</div>

<div class="mb-4">
  <FileBreadcrumb {currentFolderId} />
</div>

<!-- Files Container -->
<div class="min-h-full">
  {#if isLoading}
    <div class="flex items-center justify-center p-8 text-muted-foreground">
      <Loader class="mr-2 h-4 w-4 animate-spin" /> Loading...
    </div>
  {:else if files.length === 0}
    <div class="flex flex-col items-center justify-center p-12 text-muted-foreground">
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
      selectedFileId={fileToShow?.id}
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
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle class="h-5 w-5 text-destructive" />
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

<!-- Hidden file input for uploads -->
<input
  type="file"
  class="hidden"
  multiple
  bind:this={fileInputRef}
  onchange={(e) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      uploadFiles(Array.from(input.files));
      input.value = "";
    }
  }}
/>

<!-- New Folder Dialog -->
<Dialog.Root bind:open={newFolderDialogOpen}>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>{$t("dialogs.new_folder") || "New Folder"}</Dialog.Title>
      <Dialog.Description>
        {$t("dialogs.enter_folder_name") || "Enter the name for the new folder."}
      </Dialog.Description>
    </Dialog.Header>
    <div class="py-4">
      <input
        type="text"
        bind:value={newFolderName}
        placeholder="Folder name"
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        onkeydown={(e) => e.key === "Enter" && handleNewFolderSubmit()}
      />
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => { newFolderDialogOpen = false; newFolderName = ""; }}>
        {$t("actions.cancel") || "Cancel"}
      </Button>
      <Button onclick={handleNewFolderSubmit}>
        {$t("actions.create") || "Create"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Command Palette -->
<CommandPalette
  {files}
  onUpload={handleCommandUpload}
  onNewFolder={handleCommandNewFolder}
  onGoToFile={handleCommandGoToFile}
  onSearch={handleCommandSearch}
/>

