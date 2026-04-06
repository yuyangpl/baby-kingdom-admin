import { defineStore } from 'pinia';
import { ElNotification } from 'element-plus';

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [], // { id, type, title, message, timestamp, read }
  }),

  getters: {
    unreadCount: (state) => state.items.filter(n => !n.read).length,
  },

  actions: {
    add({ type = 'info', title, message }) {
      const id = Date.now().toString();
      this.items.unshift({ id, type, title, message, timestamp: new Date(), read: false });

      // Keep max 50
      if (this.items.length > 50) this.items.pop();

      // Show toast
      ElNotification({ type, title, message, duration: 5000 });
    },

    markAllRead() {
      this.items.forEach(n => { n.read = true; });
    },
  },
});
