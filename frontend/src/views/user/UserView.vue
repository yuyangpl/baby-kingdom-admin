<template>
  <div class="user-view">
    <h2>User Management</h2>

    <el-button type="primary" @click="showAdd = true" style="margin-bottom: 16px">
      Add User
    </el-button>

    <el-table :data="users" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="username" label="Username" width="150" />
      <el-table-column prop="email" label="Email" min-width="200" />
      <el-table-column prop="role" label="Role" width="120">
        <template #default="{ row }">
          <el-tag :type="roleType(row.role)" size="small">{{ row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lastLoginAt" label="Last Login" width="170">
        <template #default="{ row }">
          {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '-' }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'

const users = ref([])
const loading = ref(false)
const showAdd = ref(false)

const roleType = (role) => {
  const map = { admin: 'danger', editor: 'warning', viewer: 'info' }
  return map[role] || ''
}

const loadUsers = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/auth/users')
    users.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)
</script>

<style scoped>
.user-view {
  padding: 20px;
}
</style>
