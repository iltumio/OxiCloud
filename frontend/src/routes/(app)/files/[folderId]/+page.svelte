<script lang="ts">
  import { page } from "$app/stores";
  import FilesPage from "$lib/components/FilesPage.svelte";

  let folderId = $derived($page.params.folderId);
</script>

<FilesPage {folderId} />
