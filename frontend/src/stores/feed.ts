import { defineStore } from 'pinia';
import api from '../api';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface FeedFilters {
  status: string;
  source: string;
  threadFid: string;
  personaId: string;
  [key: string]: string;
}

interface Feed {
  id: string;
  _id?: string;
  status: string;
  claimedBy: string | null;
  claimedAt: string | null;
  [key: string]: any;
}

interface FeedState {
  feeds: Feed[];
  pagination: Pagination;
  filters: FeedFilters;
  loading: boolean;
  newFeedCount: number;
}

export const useFeedStore = defineStore('feed', {
  state: (): FeedState => ({
    feeds: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    filters: { status: 'pending', source: '', threadFid: '', personaId: '' },
    loading: false,
    newFeedCount: 0,
  }),

  actions: {
    async fetchFeeds() {
      this.loading = true;
      try {
        const params: Record<string, string | number> = {
          ...this.filters,
          page: this.pagination.page,
          limit: this.pagination.limit,
        };
        Object.keys(params).forEach((k) => {
          if (!params[k]) delete params[k];
        });
        const res: any = await api.get('/v1/feeds', { params });
        this.feeds = res.data || [];
        this.pagination = res.pagination || this.pagination;
      } finally {
        this.loading = false;
      }
    },

    setFilter(key: string, value: string) {
      this.filters[key] = value;
      this.pagination.page = 1;
    },

    setPage(page: number) {
      this.pagination.page = page;
    },

    incrementNewCount() {
      this.newFeedCount++;
    },

    clearNewCount() {
      this.newFeedCount = 0;
    },

    updateFeedStatus(feedId: string, status: string) {
      const feed = this.feeds.find((f) => (f.id || f._id) === feedId);
      if (feed) feed.status = status;
    },

    updateFeedClaim(feedId: string, claimedBy: string | null) {
      const feed = this.feeds.find((f) => (f.id || f._id) === feedId);
      if (feed) {
        feed.claimedBy = claimedBy;
        feed.claimedAt = claimedBy ? new Date().toISOString() : null;
      }
    },
  },
});
