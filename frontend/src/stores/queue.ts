import { defineStore } from 'pinia';
import api from '../api';

interface Queue {
  name: string;
  status: string;
  [key: string]: any;
}

interface QueueState {
  queues: Queue[];
  loading: boolean;
}

export const useQueueStore = defineStore('queue', {
  state: (): QueueState => ({
    queues: [],
    loading: false,
  }),

  actions: {
    async fetchQueues() {
      this.loading = true;
      try {
        const res: any = await api.get('/v1/queues');
        this.queues = res.data || [];
      } finally {
        this.loading = false;
      }
    },

    updateQueueStatus(name: string, status: string) {
      const q = this.queues.find((q) => q.name === name);
      if (q) q.status = status;
    },
  },
});
