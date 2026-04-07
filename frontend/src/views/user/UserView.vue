<template>
  <div class="user-view">
    <h2>{{ $t('user.title') }}</h2>

    <el-button type="primary" @click="openAdd" style="margin-bottom: 16px">
      {{ $t('user.addUser') }}
    </el-button>

    <el-table :data="users" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="username" :label="$t('user.username')" width="150" />
      <el-table-column prop="email" :label="$t('user.email')" min-width="200" />
      <el-table-column prop="role" :label="$t('user.role')" width="160">
        <template #default="{ row }">
          <el-select
            :model-value="row.role"
            size="small"
            style="width: 120px"
            @change="(val: any) => handleRoleChange(row, val)"
          >
            <el-option value="admin" :label="$t('user.roles.admin')" />
            <el-option value="editor" :label="$t('user.roles.editor')" />
            <el-option value="viewer" :label="$t('user.roles.viewer')" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="lastLoginAt" :label="$t('user.lastLogin')" width="170">
        <template #default="{ row }">
          {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="100" fixed="right">
        <template #default="{ row }">
          <el-popconfirm
            :title="$t('user.deleteConfirm')"
            :confirm-button-text="$t('common.delete')"
            :cancel-button-text="$t('common.cancel')"
            @confirm="handleDelete(row)"
          >
            <template #reference>
              <el-button type="danger" size="small" link>{{ $t('common.delete') }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <UserForm
      v-model="showForm"
      :edit-data="null"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'
import UserForm from './UserForm.vue'

const { t } = useI18n()

const users = ref<any[]>([])
const loading = ref<boolean>(false)
const showForm = ref<boolean>(false)

const loadUsers = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/auth/users')
    users.value = data ?? []
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  showForm.value = true
}

const handleRoleChange = async (row: any, newRole: string) => {
  const oldRole = row.role
  try {
    await api.put(`/v1/auth/users/${row._id || row.id}/role`, { role: newRole })
    row.role = newRole
    ElMessage.success(`Role updated to ${newRole}`)
  } catch (err: any) {
    row.role = oldRole
    ElMessage.error(err.message || 'Failed to update role')
  }
}

const handleDelete = async (row: any) => {
  try {
    await api.delete(`/v1/auth/users/${row._id || row.id}`)
    ElMessage.success(t('common.success'))
    loadUsers()
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to delete user')
  }
}

const onSaved = () => {
  loadUsers()
}

onMounted(loadUsers)
</script>

<style scoped>
.user-view {
  padding: 20px;
}
</style>
