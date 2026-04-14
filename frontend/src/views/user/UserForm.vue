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
    >
      <el-form-item :label="$t('user.username')" prop="username">
        <el-input v-model="form.username" :placeholder="$t('user.username')" />
      </el-form-item>

      <el-form-item :label="$t('user.email')" prop="email">
        <el-input v-model="form.email" type="email" placeholder="user@example.com" autocomplete="new-email" />
      </el-form-item>

      <el-form-item :label="$t('user.password')" prop="password">
        <el-input v-model="form.password" type="password" show-password :placeholder="$t('user.passwordPlaceholder')" autocomplete="new-password" />
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
  saved: []
}>()

const formRef = ref<FormInstance>()
const saving = ref<boolean>(false)

const defaultForm = () => ({
  username: '',
  email: '',
  password: '',
  role: 'approver',
})

const form = reactive(defaultForm())

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
  try {
    await api.post('/v1/auth/users', form)
    ElMessage.success(t('common.success'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
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
