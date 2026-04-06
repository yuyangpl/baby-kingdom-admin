import { defineStore } from 'pinia';
import api from '../api';

export const useFeedStore = defineStore('feed', {
  state: () => ({
    feeds: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    filters: { status: 'pending', source: '', threadFid: '', personaId: '' },
    loading: false,
    newFeedCount: 0, // from socket feed:new events
  }),

  actions: {
    async fetchFeeds() {
      this.loading = true;
      try {
        const params = { ...this.filters, page: this.pagination.page, limit: this.pagination.limit };
        Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
        const res = await api.get('/v1/feeds', { params });
        this.feeds = res.data || [];
        this.pagination = res.pagination || this.pagination;
      } finally {
        this.loading = false;
      }
    },

    setFilter(key, value) {
      this.filters[key] = value;
      this.pagination.page = 1;
    },

    setPage(page) {
      this.pagination.page = page;
    },

    incrementNewCount() {
      this.newFeedCount++;
    },

    clearNewCount() {
      this.newFeedCount = 0;
    },

    updateFeedStatus(feedId, status) {
      const feed = this.feeds.find(f => f._id === feedId);
      if (feed) feed.status = status;
    },

    updateFeedClaim(feedId, claimedBy) {
      const feed = this.feeds.find(f => f._id === feedId);
      if (feed) {
        feed.claimedBy = claimedBy;
        feed.claimedAt = claimedBy ? new Date().toISOString() : null;
      }
    },
  },
});
