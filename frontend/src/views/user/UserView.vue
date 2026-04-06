<template>
  <div class="user-view">
    <h2>User Management</h2>

    <el-button type="primary" @click="openAdd" style="margin-bottom: 16px">
      Add User
    </el-button>

    <el-table :data="users" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="username" label="Username" width="150" />
      <el-table-column prop="email" label="Email" min-width="200" />
      <el-table-column prop="role" label="Role" width="160">
        <template #default="{ row }">
          <el-select
            :model-value="row.role"
            size="small"
            style="width: 120px"
            @change="(val) => handleRoleChange(row, val)"
          >
            <el-option value="admin" label="Admin" />
            <el-option value="editor" label="Editor" />
            <el-option value="viewer" label="Viewer" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="lastLoginAt" label="Last Login" width="170">
        <template #default="{ row }">
          {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="100" fixed="right">
        <template #default="{ row }">
          <el-popconfirm
            title="Are you sure you want to delete this user?"
            confirm-button-text="Delete"
            cancel-button-text="Cancel"
            @confirm="handleDelete(row)"
          >
            <template #reference>
              <el-button type="danger" size="small" link>Delete</el-button>
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

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'
import UserForm from './UserForm.vue'

const users = ref([])
const loading = ref(false)
const showForm = ref(false)

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

const handleRoleChange = async (row, newRole) => {
  const oldRole = row.role
  try {
    await api.put(`/v1/auth/users/${row._id || row.id}/role`, { role: newRole })
    row.role = newRole
    ElMessage.success(`Role updated to ${newRole}`)
  } catch (err) {
    row.role = oldRole
    ElMessage.error(err.message || 'Failed to update role')
  }
}

const handleDelete = async (row) => {
  try {
    await api.delete(`/v1/auth/users/${row._id || row.id}`)
    ElMessage.success('User deleted')
    loadUsers()
  } catch (err) {
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
