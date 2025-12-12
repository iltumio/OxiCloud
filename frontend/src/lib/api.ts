import { getAccessToken, auth } from '$lib/stores/auth';

const API_BASE = '/api';

interface RequestOptions extends RequestInit {
    skipAuth?: boolean;
    params?: Record<string, string>;
}

export async function apiFetch(endpoint: string, options: RequestOptions = {}): Promise<Response> {
    const { skipAuth = false, headers, params, ...rest } = options;

    // Construct URL with query params
    let url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (params) {
        const query = new URLSearchParams(params).toString();
        url += (url.includes('?') ? '&' : '?') + query;
    }

    // Prepare headers
    const reqHeaders = new Headers(headers || {});

    if (!skipAuth) {
        const token = getAccessToken();
        if (token) {
            reqHeaders.set('Authorization', `Bearer ${token}`);
        }
    }

    // First attempt
    let response = await fetch(url, {
        headers: reqHeaders,
        ...rest
    });

    // Handle 401 (Unauthorized) - potentially expired token
    if (response.status === 401 && !skipAuth) {
        // Try to refresh
        const refreshed = await attemptRefresh();

        if (refreshed) {
            // Retry original request with new token
            const newToken = getAccessToken();
            if (newToken) {
                reqHeaders.set('Authorization', `Bearer ${newToken}`);
                response = await fetch(url, {
                    headers: reqHeaders,
                    ...rest
                });
            }
        } else {
            // Refresh failed, logout
            auth.logout();
        }
    }

    return response;
}

// Singleton promise to handle concurrent refresh requests
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) return false;

            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (response.ok) {
                const data = await response.json();

                // Update local storage
                localStorage.setItem('auth_token', data.access_token);
                if (data.refresh_token) {
                    localStorage.setItem('refresh_token', data.refresh_token);
                }

                // Sync store with new tokens
                auth.init();

                return true;
            }
            return false;
        } catch (e) {
            console.error('Token refresh error:', e);
            return false;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}
