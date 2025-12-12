<script lang="ts">
    import { t } from 'svelte-i18n';
    import { onMount } from 'svelte';
    import { apiFetch } from '$lib/api';
    import {
        Upload,
        FolderPlus,
        Grid,
        List,
        CloudUpload,
        Loader,
        FolderOpen,
        Folder,
        Image,
        FileText,
        Video,
        Music,
        Archive,
        Code,
        FileSpreadsheet,
        File as FileIcon
    } from 'lucide-svelte';

    interface FileItem {
        id: string;
        name: string;
        is_folder: boolean;
        size: number;
        updated_at: string | number;
        type?: string;
        mime_type?: string;
        extension?: string;
    }

    let viewMode = $state('grid'); // 'grid' or 'list'
    let files = $state<FileItem[]>([]);
    let isLoading = $state(true);
    let currentFolderId = $state<string | null>(null);

    function setView(mode: 'grid' | 'list') {
        viewMode = mode;
    }

    async function loadFiles(folderId: string | null = null) {
        isLoading = true;
        files = [];
        try {
            // 1. Fetch Folders
            let foldersUrl = '/folders';
            if (folderId) {
                foldersUrl = `/folders/${folderId}/contents`;
            }

            // 2. Fetch Files
            const filesParams: Record<string, string> = {};
            if (folderId) {
                filesParams.folder_id = folderId;
            }

            const [foldersRes, filesRes] = await Promise.all([
                apiFetch(foldersUrl),
                apiFetch('/files', { params: filesParams })
            ]);

            let folderItems: FileItem[] = [];
            if (foldersRes.ok) {
                const foldersData = await foldersRes.json();
                folderItems = foldersData.map((f: any) => ({
                    id: f.id,
                    name: f.name,
                    is_folder: true,
                    size: 0,
                    updated_at: f.updated_at || f.created_at,
                    type: 'folder'
                }));
            } else {
                console.error('Failed to load folders');
            }

            let fileItems: FileItem[] = [];
            if (filesRes.ok) {
                const filesData = await filesRes.json();
                fileItems = filesData.map((f: any) => ({
                    id: f.id,
                    name: f.name,
                    is_folder: false,
                    size: f.size,
                    updated_at: f.modified_at || f.created_at,
                    type: f.mime_type,
                    extension: f.name.split('.').pop()
                }));
            } else {
                console.error('Failed to load files');
            }

            files = [...folderItems, ...fileItems];
            currentFolderId = folderId;
        } catch (e) {
            console.error('Error loading content:', e);
        } finally {
            isLoading = false;
        }
    }

    function handleUpload() {
        console.log('Upload clicked');
    }

    function handleNewFolder() {
        console.log('New Folder clicked');
    }

    function handleItemClick(item: FileItem) {
        if (item.is_folder) {
            loadFiles(item.id);
        } else {
            console.log('File clicked:', item.name);
            // TODO: Implement file viewer
        }
    }

    function formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(dateValue: string | number): string {
        if (!dateValue) return '-';
        let date: Date;
        if (typeof dateValue === 'number') {
            // Check if seconds or milliseconds (10 billion seconds is year 2286)
            if (dateValue < 10000000000) {
                date = new Date(dateValue * 1000);
            } else {
                date = new Date(dateValue);
            }
        } else {
            date = new Date(dateValue);
        }
        return date.toLocaleDateString();
    }

    function getFileIcon(file: FileItem) {
        if (file.is_folder) return Folder;

        const ext = file.extension || file.name.split('.').pop()?.toLowerCase();

        switch(ext) {
            case 'jpg': case 'jpeg': case 'png': case 'gif': case 'svg': return Image;
            case 'pdf': return FileText;
            case 'txt': case 'md': return FileText;
            case 'mp4': case 'webm': case 'mov': return Video;
            case 'mp3': case 'wav': case 'ogg': return Music;
            case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return Archive;
            case 'js': case 'ts': case 'html': case 'css': case 'json': case 'py': case 'rs': return Code;
            case 'doc': case 'docx': return FileText;
            case 'xls': case 'xlsx': return FileSpreadsheet;
            case 'ppt': case 'pptx': return FileText;
            default: return FileIcon;
        }
    }

    onMount(() => {
        loadFiles();
    });
</script>

<h1 class="mb-5 text-2xl font-bold text-[#2d3748]">{$t('nav.files')}</h1>

<div class="mb-5 flex justify-between">
    <div class="flex gap-2.5">
        <button 
            class="flex cursor-pointer items-center gap-2 rounded-full border-none bg-[#ff5e3a] px-5 py-2.5 text-sm text-white transition hover:bg-[#e64a29]" 
            id="upload-btn" 
            onclick={handleUpload}
        >
            <Upload size={16} /> <span>{$t('actions.upload')}</span>
        </button>
        <button 
            class="flex cursor-pointer items-center gap-2 rounded-full border-none bg-[#f0f3f7] px-5 py-2.5 text-sm text-[#333] transition hover:bg-[#cbd5e0]" 
            id="new-folder-btn" 
            onclick={handleNewFolder}
        >
            <FolderPlus size={16} /> <span>{$t('actions.new_folder')}</span>
        </button>
    </div>

    <div class="flex overflow-hidden rounded-lg">
        <button
            class="cursor-pointer border-none bg-[#f0f3f7] px-4 py-2 hover:bg-[#e6e6e6]"
            class:bg-[#e6e6e6]={viewMode === 'grid'}
            onclick={() => setView('grid')}
            title="Vista de cuadrícula"
        >
            <Grid size={16} />
        </button>
        <button
            class="cursor-pointer border-none bg-[#f0f3f7] px-4 py-2 hover:bg-[#e6e6e6]"
            class:bg-[#e6e6e6]={viewMode === 'list'}
            onclick={() => setView('list')}
            title="Vista de lista"
        >
            <List size={16} />
        </button>
    </div>
</div>

<div class="my-5 hidden border-2 border-dashed border-[#ddd] p-5 text-center text-[#666] rounded-lg" id="dropzone">
    <CloudUpload size={32} class="mx-auto mb-2 text-gray-400" />
    <p>{$t('dropzone.drag_files')}</p>
    <input type="file" id="file-input" style="display: none;" multiple>
    <div class="mt-4 hidden w-full">
        <div class="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
            <div class="h-full w-0 bg-[#ff5e3a] transition-all duration-300"></div>
        </div>
    </div>
</div>

<div class="mb-4 flex items-center text-sm text-[#666]">
    <span
        class="cursor-pointer hover:underline"
        role="button"
        tabindex="0"
        onclick={() => loadFiles(null)}
        onkeydown={(e) => e.key === 'Enter' && loadFiles(null)}
    >
        {$t('breadcrumb.home')}
    </span>
    {#if currentFolderId}
        <span class="mx-2"> / </span>
        <span>...</span>
    {/if}
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
            <p>{$t('files.no_files') || 'No files in this folder'}</p>
        </div>
    {:else}
        {#if viewMode === 'grid'}
            <!-- Grid View -->
            <div class="grid gap-5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]" id="files-grid">
                {#each files as file (file.id)}
                    {@const Icon = getFileIcon(file)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                        class="flex flex-col items-center cursor-pointer rounded-lg bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                        class:border-2={false /* placeholder for drag logic */}
                        class:border-dashed={false}
                        onclick={() => handleItemClick(file)}
                        role="button"
                        tabindex="0"
                    >
                        <div class="mb-2.5 flex h-[70px] w-[100px] items-center justify-center rounded-lg {file.is_folder ? 'bg-[#ffeaa7]' : 'bg-gray-100'}">
                            {#if !file.is_folder}
                                <Icon size={32} class="text-gray-500" />
                            {:else}
                                <Folder size={32} class="text-yellow-500 fill-yellow-500" />
                            {/if}
                        </div>
                        <div class="mb-1 text-center text-sm font-medium text-[#2d3748]" title={file.name}>{file.name}</div>
                        <div class="text-center text-xs text-[#718096]">{formatSize(file.size)}</div>
                    </div>
                {/each}
            </div>
        {:else}
            <!-- List View -->
            <div class="w-full overflow-hidden rounded-lg bg-white shadow-sm" id="files-list-view">
                <div class="grid grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr] border-b border-[#e0e6ed] bg-[#f8f9fa] p-4 font-semibold text-[#2d3748]">
                    <div>{$t('files.name')}</div>
                    <div>{$t('files.type')}</div>
                    <div>{$t('files.size')}</div>
                    <div>{$t('files.modified')}</div>
                </div>
                {#each files as file (file.id)}
                    {@const Icon = getFileIcon(file)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                        class="grid cursor-pointer grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr] items-center border-b border-[#f0f0f0] bg-white p-3 hover:bg-[#f0f8ff] transition-colors"
                        onclick={() => handleItemClick(file)}
                        role="button"
                        tabindex="0"
                    >
                        <div class="flex items-center gap-3">
                            <Icon
                                size={18}
                                class="{file.is_folder ? 'text-yellow-500 fill-yellow-500' : 'text-gray-500'}"
                            />
                            {file.name}
                        </div>
                        <div class="text-sm font-medium text-[#4b5563]">{file.is_folder ? $t('files.file_types.folder') : (file.extension || 'File')}</div>
                        <div class="text-right text-sm text-[#718096] pr-4">{file.is_folder ? '-' : formatSize(file.size)}</div>
                        <div class="text-sm text-[#718096]">{formatDate(file.updated_at)}</div>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>
