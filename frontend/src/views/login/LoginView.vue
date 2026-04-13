<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <div class="login-logo__circle">BK</div>
      </div>

      <!-- Title -->
      <h1 class="login-title">{{ $t('login.title') }}</h1>
      <p class="login-subtitle">{{ $t('nav.appName') }}</p>

      <!-- Form -->
      <el-form :model="form" @submit.prevent="handleLogin" label-position="top" class="login-form">
        <el-form-item :label="$t('login.email')">
          <el-input
            v-model="form.email"
            type="email"
            :prefix-icon="Message"
            :placeholder="$t('login.placeholder.email')"
            size="large"
          />
        </el-form-item>
        <el-form-item :label="$t('login.password')">
          <el-input
            v-model="form.password"
            type="password"
            :prefix-icon="Lock"
            show-password
            :placeholder="$t('login.placeholder.password')"
            size="large"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            size="large"
            class="login-btn"
          >
            {{ $t('login.loginBtn') }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Language toggle -->
    <div class="login-lang">
      <el-button text @click="toggleLang">
        {{ appStore.language === 'zh-HK' ? 'English' : '繁體中文' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useAppStore } from '../../stores/app';
import { ElMessage } from 'element-plus';
import { Message, Lock } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n();
const auth = useAuthStore();
const appStore = useAppStore();
const router = useRouter();
const route = useRoute();
const loading = ref<boolean>(false);
const form = ref<{ email: string; password: string }>({ email: '', password: '' });

function toggleLang() {
  const newLang = appStore.language === 'zh-HK' ? 'en' : 'zh-HK';
  appStore.setLanguage(newLang);
  locale.value = newLang;
}

async function handleLogin() {
  loading.value = true;
  try {
    await auth.login(form.value.email, form.value.password);
    router.push((route.query.redirect as string) || '/feeds');
  } catch (err: any) {
    ElMessage.error(err?.error?.message || t('login.error'));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #EFF6FF, #FFFFFF, #EFF6FF);
}

.login-card {
  max-width: 400px;
  width: 100%;
  background: white;
  border-radius: var(--bk-radius-lg);
  box-shadow: var(--bk-shadow-lg);
  padding: 32px;
}

.login-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.login-logo__circle {
  width: 64px;
  height: 64px;
  background: var(--bk-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 1px;
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  color: var(--bk-foreground);
  margin: 0;
}

.login-subtitle {
  color: var(--bk-muted-fg);
  text-align: center;
  margin-top: 4px;
  margin-bottom: 24px;
  font-size: 14px;
}

.login-form {
  margin-top: 8px;
}

.login-btn {
  width: 100%;
  background: var(--bk-primary);
  border-color: var(--bk-primary);
}

.login-btn:hover {
  background: var(--bk-primary-hover);
  border-color: var(--bk-primary-hover);
}

.login-lang {
  margin-top: 16px;
}
</style>
