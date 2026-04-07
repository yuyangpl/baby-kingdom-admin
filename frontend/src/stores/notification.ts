import { defineStore } from 'pinia';
import { ElNotification } from 'element-plus';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationState {
  items: NotificationItem[];
}

export const useNotificationStore = defineStore('notification', {
  state: (): NotificationState => ({
    items: [],
  }),

  getters: {
    unreadCount: (state): number => state.items.filter((n) => !n.read).length,
  },

  actions: {
    add({ type = 'info', title, message }: { type?: NotificationType; title: string; message: string }) {
      const id = Date.now().toString();
      this.items.unshift({ id, type, title, message, timestamp: new Date(), read: false });

      // Keep max 50
      if (this.items.length > 50) this.items.pop();

      // Show toast
      ElNotification({ type, title, message, duration: 5000 });
    },

    markAllRead() {
      this.items.forEach((n) => {
        n.read = true;
      });
    },
  },
});
