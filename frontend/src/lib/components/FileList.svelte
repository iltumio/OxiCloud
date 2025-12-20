<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import FileIcon from "./FileIcon.svelte";
  import { formatSize, formatDate } from "$lib/utils";
  import { t } from "svelte-i18n";
  import * as Table from "./ui/table";

  let {
    files,
    onFileClick,
  }: { files: FileItem[]; onFileClick: (file: FileItem) => void } = $props();
</script>

<div class="w-full overflow-hidden rounded-lg border bg-card" id="files-list-view">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>{$t("files.name")}</Table.Head>
        <Table.Head>{$t("files.type")}</Table.Head>
        <Table.Head class="text-right">{$t("files.size")}</Table.Head>
        <Table.Head>{$t("files.modified")}</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each files as file (file.id)}
        <Table.Row
          class="cursor-pointer"
          onclick={() => onFileClick(file)}
        >
          <Table.Cell>
            <div class="flex items-center gap-3">
              <FileIcon {file} size={18} />
              <span class="font-medium">{file.name}</span>
            </div>
          </Table.Cell>
          <Table.Cell>
            <span class="text-sm text-muted-foreground">
              {file.is_folder
                ? $t("files.file_types.folder")
                : file.extension || "File"}
            </span>
          </Table.Cell>
          <Table.Cell class="text-right">
            <span class="text-sm text-muted-foreground">
              {file.is_folder ? "-" : formatSize(file.size)}
            </span>
          </Table.Cell>
          <Table.Cell>
            <span class="text-sm text-muted-foreground">
              {formatDate(file.updated_at)}
            </span>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>
