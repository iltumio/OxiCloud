import { browser } from "$app/environment";
import "$lib/i18n"; // Import to initialize. Important :)
import { locale, waitLocale } from "svelte-i18n";
import type { LayoutLoad } from "./$types";
import { client } from "$lib/api/client.gen";
import { env } from "$env/dynamic/public";

// Disable SSR - this is a client-side SPA
export const ssr = false;
export const prerender = false;

client.setConfig({
  baseUrl: env.PUBLIC_API_URL || "/api",
});

export const load: LayoutLoad = async () => {
  if (browser) {
    locale.set(window.navigator.language);
  }
  await waitLocale();
};
