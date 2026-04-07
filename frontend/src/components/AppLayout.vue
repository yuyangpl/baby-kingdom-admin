<template>
  <el-container class="app-layout">
    <el-aside :width="isCollapsed ? '64px' : '240px'" class="sidebar">
      <div class="logo">
        <span v-if="!isCollapsed">{{ $t('nav.appName') }}</span>
        <span v-else>{{ $t('nav.appNameShort') }}</span>
      </div>
      <el-menu
        :default-active="$route.name"
        :collapse="isCollapsed"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>{{ $t('nav.dashboard') }}</template>
        </el-menu-item>

        <el-sub-menu index="content">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>{{ $t('nav.content') }}</span>
          </template>
          <el-menu-item index="feeds">{{ $t('nav.feedQueue') }}</el-menu-item>
          <el-menu-item index="scanner">{{ $t('nav.scanner') }}</el-menu-item>
          <el-menu-item index="trends">{{ $t('nav.trends') }}</el-menu-item>
          <el-menu-item index="poster">{{ $t('nav.poster') }}</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="configuration">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>{{ $t('nav.configuration') }}</span>
          </template>
          <el-menu-item index="personas">{{ $t('nav.personas') }}</el-menu-item>
          <el-menu-item index="tones">{{ $t('nav.toneModes') }}</el-menu-item>
          <el-menu-item index="topic-rules">{{ $t('nav.topicRules') }}</el-menu-item>
          <el-menu-item index="forums">{{ $t('nav.forumBoards') }}</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="system">
          <template #title>
            <el-icon><Monitor /></el-icon>
            <span>{{ $t('nav.system') }}</span>
          </template>
          <el-menu-item index="config" v-if="auth.isAdmin">{{ $t('nav.config') }}</el-menu-item>
          <el-menu-item index="google-trends" v-if="auth.isAdmin">{{ $t('nav.googleTrends') }}</el-menu-item>
          <el-menu-item index="queues">{{ $t('nav.queueMonitor') }}</el-menu-item>
          <el-menu-item index="audit" v-if="auth.isAdmin">{{ $t('nav.auditLog') }}</el-menu-item>
          <el-menu-item index="users" v-if="auth.isAdmin">{{ $t('nav.users') }}</el-menu-item>
        </el-sub-menu>
      </el-menu>

      <div class="collapse-btn" @click="isCollapsed = !isCollapsed">
        <el-icon><Fold v-if="!isCollapsed" /><Expand v-else /></el-icon>
      </div>
    </el-aside>

    <el-container>
      <el-header class="header">
        <el-breadcrumb>
          <el-breadcrumb-item :to="{ name: 'dashboard' }">{{ $t('nav.home') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ $route.name }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="header-right">
          <el-badge :value="unreadCount || pendingCount" :hidden="!unreadCount && !pendingCount" class="notification-badge" @click="notifyStore.markAllRead()">
            <el-icon :size="20"><Bell /></el-icon>
          </el-badge>
          <el-button text @click="toggleLanguage" style="margin-right: 12px;">
            {{ locale === 'zh-HK' ? 'EN' : '繁中' }}
          </el-button>
          <el-dropdown>
            <span class="user-info">
              <el-avatar :size="28">{{ auth.user?.username?.[0]?.toUpperCase() }}</el-avatar>
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
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { useAppStore } from '../stores/app';
import { connectSocket, disconnectSocket } from '../socket';
import { registerListeners } from '../socket/listeners';
import api from '../api';

const auth = useAuthStore();
const notifyStore = useNotificationStore();
const appStore = useAppStore();
const router = useRouter();
const { locale } = useI18n();
const isCollapsed = ref<boolean>(false);
const pendingCount = ref<number>(0);

const unreadCount = computed(() => notifyStore.unreadCount);

function toggleLanguage() {
  const newLang = locale.value === 'zh-HK' ? 'en' : 'zh-HK';
  locale.value = newLang;
  appStore.setLanguage(newLang);
}

onMounted(async () => {
  try {
    const res = await api.get('/v1/dashboard/realtime');
    pendingCount.value = res.data?.pendingFeeds || 0;
  } catch { /* ignore */ }

  // Connect socket
  const socket = connectSocket();
  registerListeners(socket);
});

onUnmounted(() => {
  disconnectSocket();
});

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.app-layout {
  height: 100vh;
}
.sidebar {
  background: #304156;
  overflow-y: auto;
  transition: width 0.3s;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: bold;
}
.collapse-btn {
  text-align: center;
  padding: 12px;
  color: #bfcbd9;
  cursor: pointer;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e6e6e6;
  background: #fff;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.username {
  font-size: 14px;
}
.notification-badge {
  cursor: pointer;
}
.main-content {
  background: #f5f7fa;
  min-height: 0;
}
</style>
