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
