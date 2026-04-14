<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('user.addUser')"
    width="480px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="user-form"
      autocomplete="off"
    >
      <el-form-item :label="$t('user.username')" prop="username">
        <el-input v-model="form.username" :placeholder="$t('user.username')" />
      </el-form-item>

      <el-form-item :label="$t('user.email')" prop="email">
        <el-input v-model="form.email" placeholder="user@example.com" :readonly="autoFillGuard" @focus="autoFillGuard = false" />
      </el-form-item>

      <el-form-item :label="$t('user.password')" prop="password">
        <div style="display: flex; gap: 8px; width: 100%;">
          <el-input v-model="form.password" :type="autoFillGuard ? 'text' : 'password'" show-password :placeholder="$t('user.passwordPlaceholder')" :readonly="autoFillGuard" @focus="autoFillGuard = false" />
          <el-button @click="generatePassword">{{ $t('user.generatePassword') }}</el-button>
        </div>
      </el-form-item>

      <el-form-item :label="$t('user.role')" prop="role">
        <el-select v-model="form.role" style="width: 100%">
          <el-option value="admin" :label="$t('user.roles.admin')" />
          <el-option value="approver" :label="$t('user.roles.approver')" />
          <el-option value="viewer" :label="$t('user.roles.viewer')" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">{{ $t('user.addUser') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  editData: Record<string, any> | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [credentials: { username: string; email: string; password: string }]
}>()

const formRef = ref<FormInstance>()
const saving = ref<boolean>(false)
const autoFillGuard = ref(true)

const defaultForm = () => ({
  username: '',
  email: '',
  password: '',
  role: 'approver',
})

const form = reactive(defaultForm())

const generatePassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789!@#$%'
  form.password = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const rules = {
  username: [{ required: true, message: () => t('common.fieldRequired'), trigger: 'blur' }],
  email: [
    { required: true, message: () => t('common.fieldRequired'), trigger: 'blur' },
    { type: 'email', message: () => t('common.invalidEmail'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: () => t('common.fieldRequired'), trigger: 'blur' },
    { min: 8, message: () => t('common.minChars', { min: 8 }), trigger: 'blur' },
  ],
  role: [{ required: true, message: () => t('common.fieldRequired'), trigger: 'change' }],
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      autoFillGuard.value = true
      Object.assign(form, defaultForm())
      formRef.value?.clearValidate()
    }
  }
)

const handleSave = async () => {
  try {
    await formRef.value!.validate()
  } catch {
    return
  }
  saving.value = true
  // 保存表单数据副本，提交前启用 autoFillGuard 使密码框变 text 类型，防止浏览器弹出"保存密码"
  const payload = { ...form }
  autoFillGuard.value = true
  try {
    await api.post('/v1/auth/users', payload)
    emit('saved', { username: payload.username, email: payload.email, password: payload.password })
    emit('update:modelValue', false)
  } catch (err: any) {
    autoFillGuard.value = false
    ElMessage.error(err.message || t('common.error'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.user-form {
  padding: 0 4px;
}
</style>
