import { defineStore } from 'pinia';
import api from '../api';

export const useQueueStore = defineStore('queue', {
  state: () => ({
    queues: [],
    loading: false,
  }),

  actions: {
    async fetchQueues() {
      this.loading = true;
      try {
        const res = await api.get('/v1/queues');
        this.queues = res.data || [];
      } finally {
        this.loading = false;
      }
    },

    updateQueueStatus(name, status) {
      const q = this.queues.find(q => q.name === name);
      if (q) q.status = status;
    },
  },
});
