import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('../views/login/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('../views/dashboard/DashboardView.vue') },
      { path: 'feeds', name: 'feeds', component: () => import('../views/feed/FeedView.vue'), meta: { role: 'editor' } },
      { path: 'scanner', name: 'scanner', component: () => import('../views/scanner/ScannerView.vue'), meta: { role: 'editor' } },
      { path: 'trends', name: 'trends', component: () => import('../views/trends/TrendsView.vue'), meta: { role: 'editor' } },
      { path: 'poster', name: 'poster', component: () => import('../views/poster/PosterView.vue'), meta: { role: 'editor' } },
      { path: 'personas', name: 'personas', component: () => import('../views/persona/PersonaView.vue') },
      { path: 'tones', name: 'tones', component: () => import('../views/tone/ToneView.vue') },
      { path: 'topic-rules', name: 'topic-rules', component: () => import('../views/topic-rules/TopicRulesView.vue') },
      { path: 'forums', name: 'forums', component: () => import('../views/forum/ForumView.vue') },
      { path: 'config', name: 'config', component: () => import('../views/config/ConfigView.vue'), meta: { role: 'admin' } },
      { path: 'google-trends', name: 'google-trends', component: () => import('../views/google-trends/GoogleTrendsView.vue'), meta: { role: 'admin' } },
      { path: 'queues', name: 'queues', component: () => import('../views/queue/QueueView.vue') },
      { path: 'audit', name: 'audit', component: () => import('../views/audit/AuditView.vue'), meta: { role: 'admin' } },
      { path: 'users', name: 'users', component: () => import('../views/user/UserView.vue'), meta: { role: 'admin' } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const roleHierarchy: Record<string, number> = { admin: 3, editor: 2, viewer: 1 };

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.public) return;

  if (!auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // Load user if not loaded
  if (!auth.user) {
    await auth.fetchMe();
    if (!auth.user) return { name: 'login' };
  }

  // Role check
  const requiredRole = to.meta.role as string | undefined;
  if (requiredRole && roleHierarchy[auth.role ?? ''] < roleHierarchy[requiredRole]) {
    return { name: 'dashboard' };
  }
});

export default router;
