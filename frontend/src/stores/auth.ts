import { defineStore } from 'pinia';
import api from '../api';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'editor' | 'approver' | 'viewer';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: JSON.parse(localStorage.getItem('bk-admin-user') || 'null'),
    accessToken: localStorage.getItem('bk-admin-token'),
  }),

  getters: {
    isLoggedIn: (state): boolean => !!state.accessToken,
    isAdmin: (state): boolean => state.user?.role === 'admin',
    isEditor: (state): boolean => ['admin', 'editor'].includes(state.user?.role ?? ''),
    isApprover: (state): boolean => ['admin', 'editor', 'approver'].includes(state.user?.role ?? ''),
    role: (state): string | undefined => state.user?.role,
  },

  actions: {
    setAccessToken(token: string) {
      this.accessToken = token;
      localStorage.setItem('bk-admin-token', token);
    },

    async login(email: string, password: string) {
      const res: any = await api.post('/v1/auth/login', { email, password });
      this.accessToken = res.data.accessToken;
      this.user = res.data.user;
      localStorage.setItem('bk-admin-token', res.data.accessToken);
      localStorage.setItem('bk-admin-user', JSON.stringify(res.data.user));
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
      localStorage.removeItem('bk-admin-token');
      localStorage.removeItem('bk-admin-user');
    },
  },
});
