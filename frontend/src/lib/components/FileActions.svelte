<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Upload, FolderPlus } from "lucide-svelte";
  import { t } from "svelte-i18n";

  let {
    onUpload,
    onCreateFolder,
  }: {
    onUpload: (files: File[]) => void;
    onCreateFolder: (name: string) => void;
  } = $props();

  let fileInput: HTMLInputElement;
  let isNewFolderOpen = $state(false);
  let newFolderName = $state("");

  function handleUploadClick() {
    fileInput?.click();
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    onUpload(Array.from(input.files));
    input.value = "";
  }

  function handleCreateFolder() {
    if (!newFolderName) return;
    onCreateFolder(newFolderName);
    isNewFolderOpen = false;
    newFolderName = "";
  }
</script>

<div class="flex gap-2.5">
  <input
    type="file"
    class="hidden"
    multiple
    bind:this={fileInput}
    onchange={handleFileSelect}
  />

  <Button
    onclick={handleUploadClick}
    class="bg-[#ff5e3a] hover:bg-[#e64a29] text-white rounded-full shadow-none border-0"
  >
    <Upload size={16} class="mr-2" />
    {$t("actions.upload")}
  </Button>

  <Dialog.Root bind:open={isNewFolderOpen}>
    <Dialog.Trigger>
      {#snippet child({ props })}
        <Button
          variant="secondary"
          class="rounded-full bg-[#f0f3f7] hover:bg-[#cbd5e0] text-[#333] shadow-none border-0"
          {...props}
        >
          <FolderPlus size={16} class="mr-2" />
          {$t("actions.new_folder")}
        </Button>
      {/snippet}
    </Dialog.Trigger>
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>{$t("dialogs.new_folder") || "New Folder"}</Dialog.Title>
        <Dialog.Description
          >{$t("dialogs.enter_folder_name") ||
            "Enter the name for the new folder."}</Dialog.Description
        >
      </Dialog.Header>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Input
            id="name"
            bind:value={newFolderName}
            class="col-span-4"
            placeholder="Name"
            onkeydown={(e: KeyboardEvent) =>
              e.key === "Enter" && handleCreateFolder()}
          />
        </div>
      </div>
      <Dialog.Footer>
        <Button type="submit" onclick={handleCreateFolder}
          >{$t("actions.create") || "Create"}</Button
        >
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</div>
