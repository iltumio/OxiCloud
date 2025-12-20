<script lang="ts">
  import * as Command from "$lib/components/ui/command";
  import { Upload, FolderPlus, FileSearch, Search, Folder } from "lucide-svelte";
  import type { FileItem } from "$lib/queries";
  import { commandPaletteOpen, closeCommandPalette } from "$lib/stores/commandPalette";

  let {
    files = [],
    onUpload,
    onNewFolder,
    onGoToFile,
    onSearch,
  }: {
    files?: FileItem[];
    onUpload?: () => void;
    onNewFolder?: () => void;
    onGoToFile?: (file: FileItem) => void;
    onSearch?: (query: string) => void;
  } = $props();

  let searchValue = $state("");
  let mode = $state<"commands" | "files" | "search">("commands");

  // Filter files based on search
  let filteredFiles = $derived(
    files.filter((file) =>
      file.name.toLowerCase().includes(searchValue.toLowerCase())
    )
  );

  function handleSelect(action: string) {
    switch (action) {
      case "upload":
        closeCommandPalette();
        onUpload?.();
        break;
      case "new-folder":
        closeCommandPalette();
        onNewFolder?.();
        break;
      case "go-to-file":
        mode = "files";
        searchValue = "";
        break;
      case "search":
        mode = "search";
        searchValue = "";
        break;
    }
  }

  function handleFileSelect(file: FileItem) {
    closeCommandPalette();
    mode = "commands";
    searchValue = "";
    onGoToFile?.(file);
  }

  function handleSearchSubmit() {
    if (searchValue.trim()) {
      closeCommandPalette();
      mode = "commands";
      onSearch?.(searchValue);
      searchValue = "";
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      closeCommandPalette();
      // Reset mode when closing
      mode = "commands";
      searchValue = "";
    }
  }

  // Reset mode when dialog opens
  $effect(() => {
    if ($commandPaletteOpen) {
      mode = "commands";
      searchValue = "";
    }
  });
</script>

<Command.Dialog open={$commandPaletteOpen} onOpenChange={handleOpenChange}>
  <Command.Input
    placeholder={mode === "commands"
      ? "Type a command..."
      : mode === "files"
        ? "Search for a file..."
        : "Enter search query..."}
    bind:value={searchValue}
    onkeydown={(e) => {
      if (e.key === "Enter" && mode === "search") {
        handleSearchSubmit();
      }
      if (e.key === "Escape" && mode !== "commands") {
        e.preventDefault();
        mode = "commands";
        searchValue = "";
      }
    }}
  />
  <Command.List>
    {#if mode === "commands"}
      <Command.Empty>No commands found.</Command.Empty>
      <Command.Group heading="Actions">
        <Command.Item onSelect={() => handleSelect("upload")}>
          <Upload class="mr-2" />
          <span>Upload File</span>
          <Command.Shortcut>⌘U</Command.Shortcut>
        </Command.Item>
        <Command.Item onSelect={() => handleSelect("new-folder")}>
          <FolderPlus class="mr-2" />
          <span>New Folder</span>
          <Command.Shortcut>⌘N</Command.Shortcut>
        </Command.Item>
      </Command.Group>
      <Command.Separator />
      <Command.Group heading="Navigation">
        <Command.Item onSelect={() => handleSelect("go-to-file")}>
          <FileSearch class="mr-2" />
          <span>Go to File</span>
          <Command.Shortcut>⌘P</Command.Shortcut>
        </Command.Item>
        <Command.Item onSelect={() => handleSelect("search")}>
          <Search class="mr-2" />
          <span>Search</span>
          <Command.Shortcut>⌘F</Command.Shortcut>
        </Command.Item>
      </Command.Group>
    {:else if mode === "files"}
      <Command.Empty>No files found.</Command.Empty>
      <Command.Group heading="Files">
        {#each filteredFiles.slice(0, 10) as file (file.id)}
          <Command.Item onSelect={() => handleFileSelect(file)}>
            {#if file.is_folder}
              <Folder class="mr-2 text-yellow-500" />
            {:else}
              <FileSearch class="mr-2" />
            {/if}
            <span>{file.name}</span>
          </Command.Item>
        {/each}
      </Command.Group>
    {:else if mode === "search"}
      <Command.Empty>Press Enter to search for "{searchValue}"</Command.Empty>
      <Command.Group heading="Search">
        <Command.Item onSelect={handleSearchSubmit}>
          <Search class="mr-2" />
          <span>Search for "{searchValue || "..."}"</span>
        </Command.Item>
      </Command.Group>
    {/if}
  </Command.List>
</Command.Dialog>

