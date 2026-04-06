<template>
  <div class="login-page">
    <el-card class="login-card">
      <h1 class="title">Baby Kingdom Admin</h1>
      <el-form :model="form" @submit.prevent="handleLogin" label-position="top">
        <el-form-item label="Email">
          <el-input v-model="form.email" type="email" prefix-icon="Message" placeholder="admin@example.com" />
        </el-form-item>
        <el-form-item label="Password">
          <el-input v-model="form.password" type="password" prefix-icon="Lock" show-password placeholder="Password" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">Login</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { ElMessage } from 'element-plus';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const form = ref({ email: '', password: '' });

async function handleLogin() {
  loading.value = true;
  try {
    await auth.login(form.value.email, form.value.password);
    router.push(route.query.redirect || '/');
  } catch (err) {
    ElMessage.error(err?.error?.message || 'Login failed');
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
