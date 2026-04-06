import { defineStore } from 'pinia';
import api from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    accessToken: null,
  }),

  getters: {
    isLoggedIn: (state) => !!state.accessToken,
    isAdmin: (state) => state.user?.role === 'admin',
    isEditor: (state) => ['admin', 'editor'].includes(state.user?.role),
    role: (state) => state.user?.role,
  },

  actions: {
    setAccessToken(token) {
      this.accessToken = token;
    },

    async login(email, password) {
      const res = await api.post('/v1/auth/login', { email, password });
      this.accessToken = res.data.accessToken;
      this.user = res.data.user;
      return res;
    },

    async fetchMe() {
      try {
        const res = await api.get('/v1/auth/me');
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
