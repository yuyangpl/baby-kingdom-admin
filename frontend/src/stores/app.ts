import { defineStore } from 'pinia';

interface AppState {
  sidebarCollapsed: boolean;
  language: string;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    sidebarCollapsed: false,
    language: 'zh-HK',
  }),

  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },

    setLanguage(lang: string) {
      this.language = lang;
      localStorage.setItem('bk-admin-lang', lang);
    },
  },
});
