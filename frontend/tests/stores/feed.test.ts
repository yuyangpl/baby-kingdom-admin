import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '@/stores/feed';

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '@/api';
const mockedApi = api as any;

describe('Feed Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetchFeeds sets loading during fetch and resets after', async () => {
    const store = useFeedStore();
    let loadingDuringFetch = false;
    mockedApi.get.mockImplementation(async () => {
      loadingDuringFetch = store.loading;
      return { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
    });
    await store.fetchFeeds();
    expect(loadingDuringFetch).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('setFilter updates filter and resets page to 1', () => {
    const store = useFeedStore();
    store.pagination.page = 3;
    store.setFilter('status', 'approved');
    expect(store.filters.status).toBe('approved');
    expect(store.pagination.page).toBe(1);
  });

  it('incrementNewCount accumulates count', () => {
    const store = useFeedStore();
    store.incrementNewCount();
    store.incrementNewCount();
    expect(store.newFeedCount).toBe(2);
  });

  it('clearNewCount resets count to 0', () => {
    const store = useFeedStore();
    store.newFeedCount = 5;
    store.clearNewCount();
    expect(store.newFeedCount).toBe(0);
  });

  it('updateFeedStatus updates status of a specific feed', () => {
    const store = useFeedStore();
    store.feeds = [
      { _id: 'feed1', status: 'pending' } as any,
      { _id: 'feed2', status: 'pending' } as any,
    ];
    store.updateFeedStatus('feed1', 'approved');
    expect(store.feeds[0].status).toBe('approved');
    expect(store.feeds[1].status).toBe('pending');
  });

  it('updateFeedClaim sets claimedBy on the feed', () => {
    const store = useFeedStore();
    store.feeds = [{ _id: 'feed1', claimedBy: null, claimedAt: null } as any];
    store.updateFeedClaim('feed1', { _id: 'user1', name: 'Alice' } as any);
    expect(store.feeds[0].claimedBy).toEqual({ _id: 'user1', name: 'Alice' });
    expect(store.feeds[0].claimedAt).toBeTruthy();
  });

  it('updateFeedClaim with null clears the claim', () => {
    const store = useFeedStore();
    store.feeds = [{ _id: 'feed1', claimedBy: { _id: 'user1' }, claimedAt: '2024-01-01T00:00:00Z' } as any];
    store.updateFeedClaim('feed1', null);
    expect(store.feeds[0].claimedBy).toBeNull();
    expect(store.feeds[0].claimedAt).toBeNull();
  });
});
