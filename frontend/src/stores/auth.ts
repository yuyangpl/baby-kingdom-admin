import { defineStore } from 'pinia';
import api from '../api';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    accessToken: null,
  }),

  getters: {
    isLoggedIn: (state): boolean => !!state.accessToken,
    isAdmin: (state): boolean => state.user?.role === 'admin',
    isEditor: (state): boolean => ['admin', 'editor'].includes(state.user?.role ?? ''),
    role: (state): string | undefined => state.user?.role,
  },

  actions: {
    setAccessToken(token: string) {
      this.accessToken = token;
    },

    async login(email: string, password: string) {
      const res: any = await api.post('/v1/auth/login', { email, password });
      this.accessToken = res.data.accessToken;
      this.user = res.data.user;
      return res;
    },

    async fetchMe() {
      try {
        const res: any = await api.get('/v1/auth/me');
        this.user = res.data;
      } catch {
        this.logout();
      }
    },

    async logout() {
      try {
        await api.post('/v1/auth/logout');
      } catch { /* ignore */ }
      this.user = null;
      this.accessToken = null;
    },
  },
});
