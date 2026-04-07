<template>
  <div class="tone-view">
    <h2>Tone Modes</h2>

    <el-button type="primary" @click="openAdd" style="margin-bottom: 16px">
      Add Tone
    </el-button>

    <el-table :data="tones" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="toneId" label="Tone ID" width="120" />
      <el-table-column prop="displayName" label="Display Name" min-width="160" />
      <el-table-column prop="suitableForTier3" label="Tier 3" width="100">
        <template #default="{ row }">
          <el-tag :type="row.suitableForTier3 ? 'success' : 'info'" size="small">
            {{ row.suitableForTier3 ? 'Yes' : 'No' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="overridePriority" label="Priority" width="100" />
      <el-table-column prop="isActive" label="Active" width="100">
        <template #default="{ row }">
          <el-switch v-model="row.isActive" @change="toggleActive(row)" />
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" link @click="openEdit(row)">Edit</el-button>
          <el-popconfirm
            title="Are you sure you want to delete this tone?"
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

    <ToneForm
      v-model="showForm"
      :edit-data="editData"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'
import ToneForm from './ToneForm.vue'

const tones = ref<any[]>([])
const loading = ref<boolean>(false)
const showForm = ref<boolean>(false)
const editData = ref<Record<string, any> | null>(null)

const loadTones = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/tones')
    tones.value = data ?? []
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  editData.value = null
  showForm.value = true
}

const openEdit = (row: any) => {
  editData.value = { ...row }
  showForm.value = true
}

const handleDelete = async (row: any) => {
  try {
    await api.delete(`/v1/tones/${row.toneId}`)
    ElMessage.success('Tone deleted')
    loadTones()
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to delete tone')
  }
}

const toggleActive = async (row: any) => {
  try {
    await api.patch(`/v1/tones/${row.toneId}`, { isActive: row.isActive })
    ElMessage.success('Tone updated')
  } catch {
    row.isActive = !row.isActive
  }
}

const onSaved = () => {
  loadTones()
}

onMounted(loadTones)
</script>

<style scoped>
.tone-view {
  padding: 20px;
}
</style>
