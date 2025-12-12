import { writable, derived } from 'svelte/store';
import { goto } from '$app/navigation';

// Types
export interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    active: boolean;
    storage_quota_bytes: number;
    storage_used_bytes: number;
}

export interface AuthState {
    user: User | null;
    accessToken: string | null;
    refreshToken: string | null;
    isLoading: boolean;
    error: string | null;
}

// Initial state
const initialState: AuthState = {
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: true,
    error: null
};

function createAuthStore() {
    const { subscribe, set, update } = writable<AuthState>(initialState);

    return {
        subscribe,

        // Initialize from local storage
        init: () => {
            if (typeof localStorage === 'undefined') {
                update(state => ({ ...state, isLoading: false }));
                return;
            }

            const accessToken = localStorage.getItem('auth_token');
            const refreshToken = localStorage.getItem('refresh_token');
            const userStr = localStorage.getItem('user_data');

            if (accessToken && userStr) {
                try {
                    const user = JSON.parse(userStr);
                    update(state => ({
                        ...state,
                        accessToken,
                        refreshToken,
                        user,
                        isLoading: false
                    }));
                } catch (e) {
                    // Invalid data, clear it
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user_data');
                    update(state => ({ ...state, isLoading: false }));
                }
            } else {
                update(state => ({ ...state, isLoading: false }));
            }
        },

        // Login action
        login: async (username: string, password: string) => {
            update(state => ({ ...state, isLoading: true, error: null }));

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // Save to local storage
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('auth_token', data.access_token);
                        localStorage.setItem('refresh_token', data.refresh_token);
                        localStorage.setItem('user_data', JSON.stringify(data.user));
                    }

                    // Update store
                    update(state => ({
                        ...state,
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        user: data.user,
                        isLoading: false,
                        error: null
                    }));

                    return true;
                } else {
                    update(state => ({
                        ...state,
                        isLoading: false,
                        error: data.message || 'Login failed'
                    }));
                    return false;
                }
            } catch (e) {
                console.error('Login error:', e);
                update(state => ({
                    ...state,
                    isLoading: false,
                    error: 'An unexpected error occurred'
                }));
                return false;
            }
        },

        // Logout action
        logout: () => {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user_data');
            }

            set({
                ...initialState,
                isLoading: false
            });

            goto('/login');
        },

        // Update user data (e.g. after profile update or storage change)
        updateUser: (user: User) => {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('user_data', JSON.stringify(user));
            }
            update(state => ({ ...state, user }));
        }
    };
}

export const auth = createAuthStore();

// Derived store for easier checking
export const isAuthenticated = derived(auth, $auth => !!$auth.accessToken);

// Helper to get token for API calls
export const getAccessToken = () => {
    let token = null;
    const unsubscribe = auth.subscribe(state => {
        token = state.accessToken;
    });
    unsubscribe();
    return token;
};
