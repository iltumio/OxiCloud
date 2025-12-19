import { createQuery, type CreateQueryOptions } from "@tanstack/svelte-query";
import { fetchJSON } from "./api";
import type { User } from "./stores/auth";

// Re-export types
export type { User };

export interface FileItem {
  id: string;
  name: string;
  is_folder: boolean;
  size: number;
  updated_at: string | number;
  type?: string;
  mime_type?: string;
  extension?: string;
}

export const queryKeys = {
  user: ["user"] as const,
  files: (folderId: string | null) => ["files", folderId] as const,
  folders: (folderId: string | null) => ["folders", folderId] as const,
  recent: ["recent"] as const,
  favorites: ["favorites"] as const,
  trash: ["trash"] as const,
  shared: ["shared"] as const,
  search: (query: string) => ["search", query] as const,
};

/* --- Fetchers --- */

export async function fetchUser(): Promise<User> {
  return fetchJSON<User>("/auth/me");
}

export async function fetchFiles(folderId: string | null): Promise<any[]> {
  const params: Record<string, string> = {};
  if (folderId) {
    params.folder_id = folderId;
  }
  return fetchJSON<any[]>("/files", { params });
}

export async function fetchFolders(folderId: string | null): Promise<any[]> {
  let url = "/folders";
  if (folderId) {
    url = `/folders/${folderId}/contents`;
  }
  return fetchJSON<any[]>(url);
}

export async function fetchContent(
  folderId: string | null
): Promise<FileItem[]> {
  const [foldersData, filesData] = await Promise.all([
    fetchFolders(folderId),
    fetchFiles(folderId),
  ]);

  const folderItems: FileItem[] = foldersData.map((f: any) => ({
    id: f.id,
    name: f.name,
    is_folder: true,
    size: 0,
    updated_at: f.updated_at || f.created_at,
    type: "folder",
  }));

  const fileItems: FileItem[] = filesData.map((f: any) => ({
    id: f.id,
    name: f.name,
    is_folder: false,
    size: f.size,
    updated_at: f.modified_at || f.created_at,
    type: f.mime_type,
    extension: f.name.split(".").pop(),
  }));

  return [...folderItems, ...fileItems];
}

export async function fetchRecent(): Promise<FileItem[]> {
  const data = await fetchJSON<any[]>("/recent");
  return data.map((f: any) => ({
    id: f.id,
    name: f.name,
    is_folder: f.is_folder || false,
    size: f.size,
    updated_at: f.accessed_at || f.updated_at, // Use accessed_at if available
    type: f.mime_type || "folder",
    extension: f.name.split(".").pop(),
  }));
}

export async function fetchFavorites(): Promise<FileItem[]> {
  const data = await fetchJSON<any[]>("/favorites");
  return data.map((f: any) => ({
    id: f.item_id || f.id, // backend might return item_id
    name: f.name || "Unknown",
    is_folder: f.item_type === "folder",
    size: f.size || 0,
    updated_at: f.created_at || f.updated_at,
    type: f.item_type || "file",
    extension: f.name?.split(".").pop(),
  }));
}

export async function fetchTrash(): Promise<FileItem[]> {
  const data = await fetchJSON<any[]>("/trash");
  return data.map((f: any) => ({
    id: f.id,
    name: f.name,
    is_folder: f.item_type === "folder",
    size: f.size || 0,
    updated_at: f.deleted_at,
    type: f.item_type,
    extension: f.name.split(".").pop(),
  }));
}

export async function fetchShared(): Promise<FileItem[]> {
  const data = await fetchJSON<any[]>("/shares");
  return data.map((f: any) => ({
    id: f.item_id || f.id,
    name: f.name,
    is_folder: f.item_type === "folder",
    size: f.size || 0,
    updated_at: f.created_at,
    type: f.item_type,
    extension: f.name.split(".").pop(),
  }));
}

/* --- Query Creators --- */

export const createUserQuery = () =>
  createQuery(() => ({
    queryKey: queryKeys.user,
    queryFn: fetchUser,
  }));

export const createFilesQuery = (
  folderId: string | null | (() => string | null)
) =>
  createQuery(() => {
    const id = typeof folderId === "function" ? folderId() : folderId;
    return {
      queryKey: queryKeys.files(id),
      queryFn: () => fetchContent(id),
    };
  });

export const createRecentQuery = () =>
  createQuery(() => ({
    queryKey: queryKeys.recent,
    queryFn: fetchRecent,
  }));

export const createFavoritesQuery = () =>
  createQuery(() => ({
    queryKey: queryKeys.favorites,
    queryFn: fetchFavorites,
  }));

export const createTrashQuery = () =>
  createQuery(() => ({
    queryKey: queryKeys.trash,
    queryFn: fetchTrash,
  }));

export const createSharedQuery = () =>
  createQuery(() => ({
    queryKey: queryKeys.shared,
    queryFn: fetchShared,
  }));

export const createSearchQuery = (query: string | (() => string)) =>
  createQuery(() => {
    const q = typeof query === "function" ? query() : query;
    return {
      queryKey: queryKeys.search(q),
      queryFn: async () => {
        if (!q) return [];
        // Implement search fetcher if not already existing, for now just placeholder
        // return fetchJSON(`/search?q=${q}`);
        return [];
      },
      enabled: !!q,
    };
  });
