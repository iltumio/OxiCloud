<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { Loader } from "lucide-svelte";

  onMount(() => {
    goto("/files", { replaceState: true });
  });
</script>

<div class="flex h-full items-center justify-center">
  <Loader class="h-10 w-10 animate-spin text-primary" />
</div>

