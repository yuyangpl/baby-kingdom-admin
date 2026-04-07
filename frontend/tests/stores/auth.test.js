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
    store.user = { role: 'admin' };
    expect(store.isAdmin).toBe(true);
  });

  it('isEditor returns true for both admin and editor roles', () => {
    const store = useAuthStore();
    store.user = { role: 'admin' };
    expect(store.isEditor).toBe(true);
    store.user = { role: 'editor' };
    expect(store.isEditor).toBe(true);
  });

  it('login sets accessToken and user from API response', async () => {
    const store = useAuthStore();
    api.post.mockResolvedValue({
      data: { accessToken: 'abc123', user: { _id: '1', role: 'editor' } },
    });
    await store.login('user@example.com', 'password');
    expect(store.accessToken).toBe('abc123');
    expect(store.user).toEqual({ _id: '1', role: 'editor' });
  });

  it('logout clears token and user', async () => {
    const store = useAuthStore();
    store.accessToken = 'some-token';
    store.user = { _id: '1', role: 'admin' };
    api.post.mockResolvedValue({});
    await store.logout();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });

  it('fetchMe calls logout when API throws', async () => {
    const store = useAuthStore();
    store.accessToken = 'some-token';
    store.user = { _id: '1', role: 'admin' };
    api.get.mockRejectedValue(new Error('Unauthorized'));
    api.post.mockResolvedValue({});
    await store.fetchMe();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });
});
