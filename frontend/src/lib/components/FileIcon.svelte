<script lang="ts">
  import type { FileItem } from "$lib/queries";
  import {
    Folder,
    Image,
    FileText,
    Video,
    Music,
    Archive,
    Code,
    FileSpreadsheet,
    File as FileGeneric,
  } from "lucide-svelte";
  import { cn } from "$lib/utils";

  let {
    file,
    size = 32,
    class: className,
  }: { file: FileItem; size?: number; class?: string } = $props();

  const Icon = $derived.by(() => {
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
      case "txt":
      case "md":
      case "doc":
      case "docx":
      case "ppt":
      case "pptx":
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
      case "xls":
      case "xlsx":
        return FileSpreadsheet;
      default:
        return FileGeneric;
    }
  });
</script>

<Icon
  {size}
  class={cn(
    file.is_folder ? "text-yellow-500 fill-yellow-500" : "text-gray-500",
    className
  )}
/>
