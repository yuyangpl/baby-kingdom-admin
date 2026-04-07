import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

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

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('isLoggedIn returns true when accessToken is set', () => {
    const store = useAuthStore();
    store.accessToken = 'test-token';
    expect(store.isLoggedIn).toBe(true);
  });

  it('isAdmin returns true when user role is admin', () => {
    const store = useAuthStore();
    store.user = { role: 'admin' } as any;
    expect(store.isAdmin).toBe(true);
  });

  it('isEditor returns true for both admin and editor roles', () => {
    const store = useAuthStore();
    store.user = { role: 'admin' } as any;
    expect(store.isEditor).toBe(true);
    store.user = { role: 'editor' } as any;
    expect(store.isEditor).toBe(true);
  });

  it('login sets accessToken and user from API response', async () => {
    const store = useAuthStore();
    mockedApi.post.mockResolvedValue({
      data: { accessToken: 'abc123', user: { _id: '1', role: 'editor' } },
    });
    await store.login('user@example.com', 'password');
    expect(store.accessToken).toBe('abc123');
    expect(store.user).toEqual({ _id: '1', role: 'editor' });
  });

  it('logout clears token and user', async () => {
    const store = useAuthStore();
    store.accessToken = 'some-token';
    store.user = { _id: '1', role: 'admin' } as any;
    mockedApi.post.mockResolvedValue({});
    await store.logout();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });

  it('fetchMe calls logout when API throws', async () => {
    const store = useAuthStore();
    store.accessToken = 'some-token';
    store.user = { _id: '1', role: 'admin' } as any;
    mockedApi.get.mockRejectedValue(new Error('Unauthorized'));
    mockedApi.post.mockResolvedValue({});
    await store.fetchMe();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });
});
