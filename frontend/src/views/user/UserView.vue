<template>
  <div class="user-view">
    <div class="user-view__header">
      <h2 class="page-title">{{ $t('user.title') }}</h2>
      <el-button type="primary" @click="openAdd">
        {{ $t('user.addUser') }}
      </el-button>
    </div>

    <!-- Role description cards -->
    <div class="role-cards">
      <div class="role-card role-card--admin">
        <div class="role-card__header">
          <el-tag type="danger" size="small" effect="dark">{{ $t('user.roles.admin') }}</el-tag>
        </div>
        <p class="role-card__desc">{{ $t('user.roleDesc.admin') }}</p>
      </div>
      <div class="role-card role-card--editor">
        <div class="role-card__header">
          <el-tag type="primary" size="small" effect="dark">{{ $t('user.roles.editor') }}</el-tag>
        </div>
        <p class="role-card__desc">{{ $t('user.roleDesc.editor') }}</p>
      </div>
      <div class="role-card role-card--viewer">
        <div class="role-card__header">
          <el-tag type="info" size="small" effect="dark">{{ $t('user.roles.viewer') }}</el-tag>
        </div>
        <p class="role-card__desc">{{ $t('user.roleDesc.viewer') }}</p>
      </div>
    </div>

    <!-- Users table -->
    <el-table
      :data="users"
      v-loading="loading"
      stripe
      border
      style="width: 100%"
      :row-class-name="rowClassName"
    >
      <el-table-column :label="$t('common.avatar')" width="70" align="center">
        <template #default="{ row }">
          <div class="avatar-gradient user-avatar">
            {{ avatarInitial(row.username) }}
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="username" :label="$t('user.username')" width="160">
        <template #default="{ row }">
          <span>{{ row.username }}</span>
          <el-tag
            v-if="isCurrentUser(row)"
            size="small"
            effect="plain"
            style="margin-left: 8px"
          >
            {{ $t('user.you') }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="email" :label="$t('user.email')" min-width="200" />

      <el-table-column prop="role" :label="$t('user.role')" width="160">
        <template #default="{ row }">
          <el-select
            :model-value="row.role"
            size="small"
            style="width: 120px"
            :disabled="isCurrentUser(row)"
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
          {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '--' }}
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" :label="$t('common.createdAt')" width="170">
        <template #default="{ row }">
          {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '--' }}
        </template>
      </el-table-column>

      <el-table-column :label="$t('common.actions')" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <el-popconfirm
            v-if="!isCurrentUser(row)"
            :title="$t('user.deleteConfirm')"
            :confirm-button-text="$t('common.delete')"
            :cancel-button-text="$t('common.cancel')"
            @confirm="handleDelete(row)"
          >
            <template #reference>
              <el-button type="danger" size="small" plain>
                {{ $t('common.delete') }}
              </el-button>
            </template>
          </el-popconfirm>
          <span v-else class="text-muted">--</span>
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
import { useAuthStore } from '../../stores/auth'
import api from '../../api'
import UserForm from './UserForm.vue'

const { t } = useI18n()
const auth = useAuthStore()

const users = ref<any[]>([])
const loading = ref<boolean>(false)
const showForm = ref<boolean>(false)

const avatarInitial = (name: string) => {
  return name ? name.charAt(0).toUpperCase() : '?'
}

const isCurrentUser = (row: any) => {
  return auth.user?.id === (row.id || row._id)
}

const rowClassName = ({ row }: { row: any }) => {
  return isCurrentUser(row) ? 'current-user-row' : ''
}

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
    await api.put(`/v1/auth/users/${row.id || row._id}/role`, { role: newRole })
    row.role = newRole
    ElMessage.success(t('user.roleUpdated', { role: newRole }))
  } catch (err: any) {
    row.role = oldRole
    ElMessage.error(err.message || t('user.roleFailed'))
  }
}

const handleDelete = async (row: any) => {
  try {
    await api.delete(`/v1/auth/users/${row.id || row._id}`)
    ElMessage.success(t('common.success'))
    loadUsers()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.deleteFailed'))
  }
}

const onSaved = () => {
  loadUsers()
}

onMounted(loadUsers)
</script>

<style scoped>
.user-view {
}
.user-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* Role description cards */
.role-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.role-card {
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  padding: 16px;
  border-left-width: 4px;
}
.role-card--admin {
  border-left-color: var(--bk-danger);
}
.role-card--editor {
  border-left-color: var(--bk-primary);
}
.role-card--viewer {
  border-left-color: var(--bk-muted-fg);
}
.role-card__header {
  margin-bottom: 8px;
}
.role-card__desc {
  margin: 0;
  font-size: 13px;
  color: var(--bk-muted-fg);
  line-height: 1.5;
}

/* User avatar */
.user-avatar {
  width: 40px;
  height: 40px;
  font-size: 16px;
}

/* Current user row highlight */
:deep(.current-user-row) {
  background-color: #EFF6FF !important;
}
:deep(.current-user-row td) {
  background-color: #EFF6FF !important;
}

.text-muted {
  color: var(--bk-muted-fg);
  font-size: 13px;
}

@media (max-width: 768px) {
  .role-cards {
    grid-template-columns: 1fr;
  }
}
</style>
