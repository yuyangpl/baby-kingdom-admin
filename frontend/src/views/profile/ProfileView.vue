<template>
  <div class="profile-view">
    <h1 class="page-title">{{ $t('profile.title') }}</h1>

    <!-- User Info -->
    <el-card shadow="never" class="profile-card">
      <template #header>
        <span class="card-title">{{ $t('profile.basicInfo') }}</span>
      </template>
      <el-descriptions :column="1" border>
        <el-descriptions-item :label="$t('user.username')">{{ auth.user?.username }}</el-descriptions-item>
        <el-descriptions-item :label="$t('user.email')">{{ auth.user?.email }}</el-descriptions-item>
        <el-descriptions-item :label="$t('user.role')">
          <el-tag :type="auth.isAdmin ? 'danger' : auth.isApprover ? 'primary' : 'info'" size="small">
            {{ $t(`user.roles.${auth.user?.role}`) }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- Change Password -->
    <el-card shadow="never" class="profile-card">
      <template #header>
        <span class="card-title">{{ $t('profile.changePassword') }}</span>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        style="max-width: 400px;"
      >
        <el-form-item :label="$t('profile.currentPassword')" prop="currentPassword">
          <el-input v-model="form.currentPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item :label="$t('profile.newPassword')" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item :label="$t('profile.confirmPassword')" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleChangePassword">{{ $t('profile.changePassword') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import api from '../../api'

const { t } = useI18n()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const saving = ref(false)

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const rules = {
  currentPassword: [{ required: true, message: () => t('common.fieldRequired'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: () => t('common.fieldRequired'), trigger: 'blur' },
    { min: 8, message: () => t('common.minChars', { min: 8 }), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: () => t('common.fieldRequired'), trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: Function) => {
        if (value !== form.newPassword) {
          callback(new Error(t('profile.passwordMismatch')))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const handleChangePassword = async () => {
  try {
    await formRef.value!.validate()
  } catch { return }

  saving.value = true
  try {
    await api.put('/v1/auth/password', {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    })
    ElMessage.success(t('profile.passwordChanged'))
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    formRef.value?.clearValidate()
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.profile-view {
  max-width: 600px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 20px;
}
.profile-card {
  margin-bottom: 20px;
  border-radius: var(--bk-radius);
}
.card-title {
  font-weight: 600;
  font-size: 16px;
}
</style>
