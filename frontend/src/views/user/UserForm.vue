<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="Create User"
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
      <el-form-item label="Username" prop="username">
        <el-input v-model="form.username" placeholder="Enter username" />
      </el-form-item>

      <el-form-item label="Email" prop="email">
        <el-input v-model="form.email" type="email" placeholder="user@example.com" />
      </el-form-item>

      <el-form-item label="Password" prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="Min 8 characters" />
      </el-form-item>

      <el-form-item label="Role" prop="role">
        <el-radio-group v-model="form.role" class="role-radio-group">
          <div class="role-option">
            <el-radio value="admin">Admin</el-radio>
            <span class="role-desc">Full access to all settings and actions</span>
          </div>
          <div class="role-option">
            <el-radio value="editor">Editor</el-radio>
            <span class="role-desc">Can manage content, approve feeds, edit personas</span>
          </div>
          <div class="role-option">
            <el-radio value="viewer">Viewer</el-radio>
            <span class="role-desc">Read-only access to dashboards and reports</span>
          </div>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">Create User</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import api from '../../api'

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
  role: 'viewer',
})

const form = reactive(defaultForm())

const rules = {
  username: [{ required: true, message: 'Username is required', trigger: 'blur' }],
  email: [
    { required: true, message: 'Email is required', trigger: 'blur' },
    { type: 'email', message: 'Please enter a valid email', trigger: 'blur' },
  ],
  password: [
    { required: true, message: 'Password is required', trigger: 'blur' },
    { min: 8, message: 'Password must be at least 8 characters', trigger: 'blur' },
  ],
  role: [{ required: true, message: 'Role is required', trigger: 'change' }],
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
    ElMessage.success('User created successfully')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to create user')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.user-form {
  padding: 0 4px;
}
.role-radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.role-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
.role-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
