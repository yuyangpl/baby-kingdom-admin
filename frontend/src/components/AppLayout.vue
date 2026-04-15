<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
      <div class="sidebar-logo">
        <span v-if="!isCollapsed" class="sidebar-logo__text">{{ $t('nav.appName') }}</span>
        <span v-else class="sidebar-logo__text">{{ $t('nav.appNameShort') }}</span>
        <span v-if="!isCollapsed" class="sidebar-logo__sub">{{ $t('nav.appTitle') }}</span>
      </div>

      <nav class="sidebar-nav">
        <!-- Dashboard (admin only) -->
        <div v-if="auth.isAdmin" class="nav-group">
          <div v-if="!isCollapsed" class="nav-group__title">{{ $t('nav.overview') }}</div>
          <router-link to="/" class="nav-item" :class="{ 'nav-item--active': $route.name === 'dashboard' }">
            <el-icon class="nav-item__icon"><DataAnalysis /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.dashboard') }}</span>
          </router-link>
        </div>

        <!-- Feeds (all authenticated) -->
        <div class="nav-group">
          <div v-if="!isCollapsed" class="nav-group__title">{{ $t('nav.content') }}</div>
          <router-link v-if="!auth.isAdmin" to="/my-dashboard" class="nav-item" :class="{ 'nav-item--active': $route.name === 'my-dashboard' }">
            <el-icon class="nav-item__icon"><DataLine /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.myDashboard') }}</span>
          </router-link>
          <router-link to="/feeds" class="nav-item" :class="{ 'nav-item--active': $route.name === 'feeds' }">
            <el-icon class="nav-item__icon"><Document /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.feedQueue') }}</span>
          </router-link>
        </div>

        <!-- Configuration (approver: only personas; editor+: all) -->
        <div v-if="auth.isApprover" class="nav-group">
          <div v-if="!isCollapsed" class="nav-group__title">{{ $t('nav.configuration') }}</div>
          <router-link to="/personas" class="nav-item" :class="{ 'nav-item--active': $route.name === 'personas' }">
            <el-icon class="nav-item__icon"><User /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.personas') }}</span>
          </router-link>
          <router-link v-if="auth.isApprover" to="/tones" class="nav-item" :class="{ 'nav-item--active': $route.name === 'tones' }">
            <el-icon class="nav-item__icon"><ChatDotRound /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.toneModes') }}</span>
          </router-link>
          <router-link v-if="auth.isApprover" to="/topic-rules" class="nav-item" :class="{ 'nav-item--active': $route.name === 'topic-rules' }">
            <el-icon class="nav-item__icon"><List /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.topicRules') }}</span>
          </router-link>
          <router-link v-if="auth.isApprover" to="/forums" class="nav-item" :class="{ 'nav-item--active': $route.name === 'forums' }">
            <el-icon class="nav-item__icon"><Grid /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.forumBoards') }}</span>
          </router-link>
        </div>

        <!-- System (admin only) -->
        <div v-if="auth.isAdmin" class="nav-group">
          <div v-if="!isCollapsed" class="nav-group__title">{{ $t('nav.system') }}</div>
          <router-link to="/config" class="nav-item" :class="{ 'nav-item--active': $route.name === 'config' }">
            <el-icon class="nav-item__icon"><Setting /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.config') }}</span>
          </router-link>
          <!-- 採集源 submenu -->
          <div class="nav-submenu" :class="{ 'nav-submenu--open': dataSourcesOpen }">
            <div class="nav-item" @click="dataSourcesOpen = !dataSourcesOpen">
              <el-icon class="nav-item__icon"><Connection /></el-icon>
              <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.dataSources') }}</span>
              <el-icon v-if="!isCollapsed" class="nav-submenu__arrow" :size="12">
                <ArrowDown v-if="!dataSourcesOpen" /><ArrowUp v-else />
              </el-icon>
            </div>
            <div v-if="dataSourcesOpen" class="nav-submenu__items">
              <router-link to="/scanner" class="nav-item nav-item--sub" :class="{ 'nav-item--active': $route.name === 'scanner' }">
                <el-icon class="nav-item__icon"><Search /></el-icon>
                <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.scanner') }}</span>
              </router-link>
              <router-link to="/trends" class="nav-item nav-item--sub" :class="{ 'nav-item--active': $route.name === 'trends' }">
                <el-icon class="nav-item__icon"><TrendCharts /></el-icon>
                <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.trends') }}</span>
              </router-link>
              <router-link to="/google-trends" class="nav-item nav-item--sub" :class="{ 'nav-item--active': $route.name === 'google-trends' }">
                <el-icon class="nav-item__icon"><DataLine /></el-icon>
                <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.googleTrends') }}</span>
              </router-link>
            </div>
          </div>
          <router-link to="/audit" class="nav-item" :class="{ 'nav-item--active': $route.name === 'audit' }">
            <el-icon class="nav-item__icon"><Notebook /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.auditLog') }}</span>
          </router-link>
          <router-link to="/users" class="nav-item" :class="{ 'nav-item--active': $route.name === 'users' }">
            <el-icon class="nav-item__icon"><UserFilled /></el-icon>
            <span v-if="!isCollapsed" class="nav-item__text">{{ $t('nav.users') }}</span>
          </router-link>
        </div>
      </nav>

      <!-- Approver: personal stats (fixed bottom) -->
      <div v-if="!auth.isAdmin && !isCollapsed" class="sidebar-stats">
        <div class="sidebar-stats__row">
          <span class="sidebar-stats__label">{{ $t('myDashboard.processed') }}</span>
          <span class="sidebar-stats__value">{{ approverStats.total }} {{ $t('myDashboard.items') }}</span>
        </div>
        <div class="sidebar-stats__detail">
          <span class="sidebar-stats__chip sidebar-stats__chip--posted" @click="goFeedTab('posted')">{{ $t('myDashboard.posted') }} {{ approverStats.posted }}</span>
          <span class="sidebar-stats__chip sidebar-stats__chip--no" @click="goFeedTab('rejected')">{{ $t('myDashboard.rejected') }} {{ approverStats.rejected }}</span>
          <span class="sidebar-stats__chip sidebar-stats__chip--fail" @click="goFeedTab('failed')">{{ $t('common.failed') }} {{ approverStats.failed }}</span>
          <span class="sidebar-stats__chip sidebar-stats__chip--skip" @click="goFeedTab('pending')">{{ $t('myDashboard.skipped') }} {{ approverStats.skipped }}</span>
        </div>
      </div>
    </aside>

    <!-- Main area -->
    <div class="main-wrapper">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <button class="header-toggle" @click="isCollapsed = !isCollapsed" aria-label="Toggle sidebar">
            <el-icon :size="20"><Fold v-if="!isCollapsed" /><Expand v-else /></el-icon>
          </button>
          <span class="header-title">{{ $t('nav.appName') }}</span>
        </div>
        <div class="header-right">
          <div class="queue-stats">
            <span class="queue-stat">{{ $t('nav.poolRemaining') }} <strong class="queue-stat__num">{{ queueStats.unclaimed }}</strong></span>
            <span class="queue-stat-divider">|</span>
            <span class="queue-stat">{{ $t('nav.claimed') }} <strong class="queue-stat__num queue-stat__num--claimed">{{ queueStats.claimed }}</strong></span>
          </div>
          <button class="lang-toggle" @click="toggleLanguage">
            {{ locale === 'zh-HK' ? 'EN' : '繁中' }}
          </button>
          <el-dropdown>
            <span class="user-info">
              <div class="avatar-gradient" style="width: 32px; height: 32px; font-size: 14px;">
                {{ auth.user?.username?.[0]?.toUpperCase() }}
              </div>
              <span class="username">{{ auth.user?.username }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/profile')">{{ $t('nav.profile') }}</el-dropdown-item>
                <el-dropdown-item @click="router.push('/guide')">{{ $t('nav.guide') }}</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">{{ $t('nav.logout') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- Content -->
      <main class="main-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { useAppStore } from '../stores/app';
import api from '../api';

const auth = useAuthStore();
const notifyStore = useNotificationStore();
const appStore = useAppStore();
const router = useRouter();
const { locale } = useI18n();
const isCollapsed = ref<boolean>(false);
const dataSourcesOpen = ref<boolean>(false);
const queueStats = ref({ unclaimed: 0, claimed: 0 });
const approverStats = ref({ total: 0, rejected: 0, skipped: 0, posted: 0, failed: 0 });
const approverAvgTime = computed(() => {
  if (approverStats.value.total === 0) return '--';
  const s = approverStats.value.avgSeconds;
  if (s < 60) return `${s} 秒/條`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /條`;
});

function toggleLanguage() {
  const newLang = locale.value === 'zh-HK' ? 'en' : 'zh-HK';
  locale.value = newLang;
  appStore.setLanguage(newLang);
}

// Poll for updates (replaces Socket.io real-time events)
let pollTimer: ReturnType<typeof setInterval> | null = null;

const loadQueueStats = async () => {
  try {
    const params = auth.isAdmin ? {} : { mine: 'true' };
    const res: any = await api.get('/v1/review-queue/stats', { params });
    const data = res.data || res;
    queueStats.value = { unclaimed: data.unclaimed || 0, claimed: data.claimed || 0 };
  } catch { /* ignore */ }
};

const loadApproverStats = async () => {
  if (auth.isAdmin) return;
  try {
    const res: any = await api.get('/v1/review-queue/my-stats');
    approverStats.value = res.data || res;
  } catch { /* ignore */ }
};

const onRefreshStats = () => {
  loadQueueStats();
  loadApproverStats();
};

onMounted(async () => {
  await Promise.all([loadQueueStats(), loadApproverStats()]);
  window.addEventListener('refresh-queue-stats', onRefreshStats);

  // Poll stats every 30s
  pollTimer = setInterval(async () => {
    await Promise.all([loadQueueStats(), loadApproverStats()]);
  }, 30000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  window.removeEventListener('refresh-queue-stats', onRefreshStats);
});

function goFeedTab(tab: string) {
  router.push({ path: '/feeds', query: { tab } });
}

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: var(--bk-sidebar-width);
  background: var(--bk-sidebar);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar--collapsed {
  width: var(--bk-sidebar-collapsed);
}

.sidebar-logo {
  height: var(--bk-header-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  gap: 2px;
}
.sidebar-logo__text {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
}
.sidebar-logo__sub {
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.nav-group {
  margin-bottom: 8px;
}
.nav-group__title {
  font-size: 11px;
  color: var(--bk-sidebar-group);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 20px 4px;
  white-space: nowrap;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  color: var(--bk-sidebar-text);
  text-decoration: none;
  transition: background 0.15s ease;
  cursor: pointer;
  white-space: nowrap;
}
.sidebar--collapsed .nav-item {
  padding: 10px 0;
  justify-content: center;
}
.nav-item:hover {
  background: var(--bk-sidebar-hover);
}
.nav-item--active {
  background: var(--bk-sidebar-active) !important;
  color: #fff;
}
.nav-item__icon {
  font-size: 18px;
  flex-shrink: 0;
}
.nav-item__text {
  margin-left: 12px;
  font-size: 14px;
}

.nav-submenu__arrow {
  margin-left: auto;
  transition: transform 0.2s;
}
.nav-submenu__items {
  overflow: hidden;
}
.nav-item--sub {
  padding-left: 44px;
  font-size: 13px;
}

/* Sidebar approver stats */
.sidebar-stats {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.sidebar-stats__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.sidebar-stats__row:last-child { margin-bottom: 0; }
.sidebar-stats__label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
.sidebar-stats__value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.sidebar-stats__detail {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.sidebar-stats__chip {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.sidebar-stats__chip:hover {
  opacity: 0.8;
}
.sidebar-stats__chip--ok {
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
}
.sidebar-stats__chip--posted {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
}
.sidebar-stats__chip--no {
  background: rgba(144, 147, 153, 0.15);
  color: #909399;
}
.sidebar-stats__chip--fail {
  background: rgba(245, 108, 108, 0.15);
  color: #f56c6c;
}
.sidebar-stats__chip--skip {
  background: rgba(230, 162, 60, 0.15);
  color: #e6a23c;
}

/* Main wrapper */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 600px;
}

/* Header */
.header {
  height: var(--bk-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--bk-card);
  border-bottom: 1px solid var(--bk-border);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--bk-muted-fg);
  padding: 6px;
  border-radius: var(--bk-radius-sm);
  display: flex;
  align-items: center;
  transition: var(--bk-transition);
}
.header-toggle:hover {
  background: var(--bk-muted);
  color: var(--bk-foreground);
}
.header-title {
  font-size: 14px;
  color: var(--bk-muted-fg);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.lang-toggle {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--bk-muted-fg);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  background: none;
  cursor: pointer;
  transition: var(--bk-transition);
}
.lang-toggle:hover {
  color: var(--bk-foreground);
  border-color: var(--bk-foreground);
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.username {
  font-size: 14px;
  color: var(--bk-foreground);
}
.queue-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--bk-muted-fg);
}
.queue-stat__num {
  font-size: 18px;
  font-weight: 700;
  color: var(--bk-primary);
  margin-left: 4px;
}
.queue-stat__num--claimed {
  color: var(--bk-success);
}
.queue-stat-divider {
  color: var(--bk-border);
}

/* Content */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bk-background);
}
</style>
