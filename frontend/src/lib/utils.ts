import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Snippet } from "svelte";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type WithElementRef<T> = T & {
	ref?: import("svelte").Snippet<[import("svelte/elements").Element]> | null;
};

export type WithoutChildren<T> = Omit<T, "children">;
export type WithoutChildrenOrChild<T> = Omit<T, "children" | "child">;

export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(dateValue: string | number): string {
  if (!dateValue) return "-";
  let date: Date;
  if (typeof dateValue === "number") {
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
