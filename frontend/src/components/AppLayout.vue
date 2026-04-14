<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
      <div class="sidebar-logo">
        <span v-if="!isCollapsed" class="sidebar-logo__text">{{ $t('nav.appName') }}</span>
        <span v-else class="sidebar-logo__text">{{ $t('nav.appNameShort') }}</span>
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
    </aside>

    <!-- Main area -->
    <div class="main-wrapper">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <button class="header-toggle" @click="isCollapsed = !isCollapsed" aria-label="Toggle sidebar">
            <el-icon :size="20"><Fold v-if="!isCollapsed" /><Expand v-else /></el-icon>
          </button>
          <span class="header-title">{{ $t('nav.appTitle') }}</span>
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
                <el-dropdown-item>{{ auth.user?.role }}</el-dropdown-item>
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

function toggleLanguage() {
  const newLang = locale.value === 'zh-HK' ? 'en' : 'zh-HK';
  locale.value = newLang;
  appStore.setLanguage(newLang);
}

// Poll for updates (replaces Socket.io real-time events)
let pollTimer: ReturnType<typeof setInterval> | null = null;

const loadQueueStats = async () => {
  try {
    const res: any = await api.get('/v1/review-queue/stats');
    const data = res.data || res;
    queueStats.value = { unclaimed: data.unclaimed || 0, claimed: data.claimed || 0 };
  } catch { /* ignore */ }
};

onMounted(async () => {
  await loadQueueStats();

  // Poll queue stats every 30s
  pollTimer = setInterval(async () => {
    await loadQueueStats();
  }, 30000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

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
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.sidebar-logo__text {
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  white-space: nowrap;
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

/* Main wrapper */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
