import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';
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

// Dummy component for all routes
const Dummy = { template: '<div>test</div>' };

const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };

function createTestRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/login', name: 'login', component: Dummy, meta: { public: true } },
      {
        path: '/',
        component: Dummy,
        children: [
          { path: '', name: 'dashboard', component: Dummy },
          { path: 'feeds', name: 'feeds', component: Dummy, meta: { role: 'editor' } },
          { path: 'config', name: 'config', component: Dummy, meta: { role: 'admin' } },
        ],
      },
    ],
  });

  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    if (to.meta.public) return;
    if (!auth.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
    if (!auth.user) {
      await auth.fetchMe();
      if (!auth.user) return { name: 'login' };
    }
    const requiredRole = to.meta.role;
    if (requiredRole && roleHierarchy[auth.role] < roleHierarchy[requiredRole]) {
      return { name: 'dashboard' };
    }
  });

  return router;
}

describe('Router Guards', () => {
  let router;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    router = createTestRouter();
  });

  it('redirects to /login with redirect query when not logged in', async () => {
    // No token set — auth.isLoggedIn = false
    await router.push('/feeds');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/feeds');
  });

  it('redirects viewer to dashboard when accessing admin-only route', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'viewer-token';
    auth.user = { role: 'viewer' };

    await router.push('/config');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('allows editor to access editor-only route', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'editor-token';
    auth.user = { role: 'editor' };

    await router.push('/feeds');
    expect(router.currentRoute.value.name).toBe('feeds');
  });

  it('allows access to /login without auth (public route)', async () => {
    // No token — route is public so it should not redirect
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBeUndefined();
  });

  it('calls fetchMe when token exists but user is null', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'some-token';
    // auth.user remains null

    // fetchMe will succeed and set the user
    api.get.mockResolvedValue({ data: { role: 'editor' } });

    await router.push('/feeds');

    expect(api.get).toHaveBeenCalledWith('/v1/auth/me');
    // After fetchMe sets role to editor, accessing /feeds (role: editor) should succeed
    expect(router.currentRoute.value.name).toBe('feeds');
  });
});
