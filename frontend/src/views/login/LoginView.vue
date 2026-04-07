<template>
  <div class="login-page">
    <el-card class="login-card">
      <h1 class="title">{{ $t('login.title') }}</h1>
      <el-form :model="form" @submit.prevent="handleLogin" label-position="top">
        <el-form-item :label="$t('login.email')">
          <el-input v-model="form.email" type="email" prefix-icon="Message" :placeholder="$t('login.placeholder.email')" />
        </el-form-item>
        <el-form-item :label="$t('login.password')">
          <el-input v-model="form.password" type="password" prefix-icon="Lock" show-password :placeholder="$t('login.placeholder.password')" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">{{ $t('login.loginBtn') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const loading = ref<boolean>(false);
const form = ref<{ email: string; password: string }>({ email: '', password: '' });

async function handleLogin() {
  loading.value = true;
  try {
    await auth.login(form.value.email, form.value.password);
    router.push((route.query.redirect as string) || '/');
  } catch (err: any) {
    ElMessage.error(err?.error?.message || t('login.error'));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f4fd 0%, #ffffff 100%);
}
.login-card {
  width: 400px;
}
.title {
  text-align: center;
  margin-bottom: 24px;
  color: #304156;
}
</style>
