<template>
  <div class="tone-view">
    <h2>Tone Modes</h2>

    <el-button type="primary" @click="showAdd = true" style="margin-bottom: 16px">
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
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'

const tones = ref([])
const loading = ref(false)
const showAdd = ref(false)

const loadTones = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/tones')
    tones.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const toggleActive = async (row) => {
  try {
    await api.patch(`/v1/tones/${row.toneId}`, { isActive: row.isActive })
    ElMessage.success('Tone updated')
  } catch {
    row.isActive = !row.isActive
  }
}

onMounted(loadTones)
</script>

<style scoped>
.tone-view {
  padding: 20px;
}
</style>
