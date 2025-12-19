<script lang="ts">
  import { t } from "svelte-i18n";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";

  let {
    currentFolderId,
    onNavigate,
  }: {
    currentFolderId: string | null;
    onNavigate: (id: string | null) => void;
  } = $props();
</script>

<Breadcrumb.Root>
  <Breadcrumb.List>
    <Breadcrumb.Item>
      <Breadcrumb.Link
        href="#"
        onclick={(e) => {
          e.preventDefault();
          onNavigate(null);
        }}
      >
        {$t("breadcrumb.home")}
      </Breadcrumb.Link>
    </Breadcrumb.Item>
    {#if currentFolderId}
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>...</Breadcrumb.Page>
      </Breadcrumb.Item>
    {/if}
  </Breadcrumb.List>
</Breadcrumb.Root>
