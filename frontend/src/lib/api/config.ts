import { client } from "./client.gen";
import { getAccessToken, auth } from "$lib/stores/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// Configure base URL
client.setConfig({
  baseUrl: BASE_URL,
});

// Configure auth interceptor
client.interceptors.request.use((request, options) => {
  const token = getAccessToken();
  if (token) {
    request.headers.set("Authorization", `Bearer ${token}`);
  }
  return request;
});

// Configure response interceptor for 401 handling
client.interceptors.response.use(async (response, request, options) => {
  if (response.status === 401) {
    // Prevent infinite loops
    if (
      request.url.includes("/auth/refresh") ||
      request.url.includes("/auth/login")
    ) {
      return response;
    }

    try {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        // Retry the original request with new token
        const token = getAccessToken();
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
          // Clone the request to retry it
          const newRequest = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            mode: request.mode,
            credentials: request.credentials,
            cache: request.cache,
            redirect: request.redirect,
            referrer: request.referrer,
            integrity: request.integrity,
          });
          return fetch(newRequest);
        }
      } else {
        auth.logout();
      }
    } catch (error) {
      auth.logout();
    }
  }
  return response;
});

// Singleton promise to handle concurrent refresh requests
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) return false;

      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();

        // Update local storage
        localStorage.setItem("auth_token", data.access_token);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }

        // Sync store with new tokens
        auth.init();

        return true;
      }
      return false;
    } catch (e) {
      console.error("Token refresh error:", e);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export { client };
