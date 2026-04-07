import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useQueueStore } from '@/stores/queue';

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

describe('Queue Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('queues is initially an empty array', () => {
    const store = useQueueStore();
    expect(store.queues).toEqual([]);
  });

  it('fetchQueues sets loading during fetch and populates queues', async () => {
    const store = useQueueStore();
    const mockQueues = [{ name: 'scanner', status: 'active' }, { name: 'poster', status: 'paused' }];
    let loadingDuringFetch = false;
    mockedApi.get.mockImplementation(async () => {
      loadingDuringFetch = store.loading;
      return { data: mockQueues };
    });
    await store.fetchQueues();
    expect(loadingDuringFetch).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.queues).toEqual(mockQueues);
  });

  it('updateQueueStatus updates status of a specific queue by name', () => {
    const store = useQueueStore();
    store.queues = [
      { name: 'scanner', status: 'active' },
      { name: 'poster', status: 'active' },
    ];
    store.updateQueueStatus('scanner', 'paused');
    expect(store.queues[0].status).toBe('paused');
    expect(store.queues[1].status).toBe('active');
  });
});
