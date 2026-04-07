<template>
  <div class="audit-view">
    <h2>Audit Log</h2>

    <el-table :data="audits" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="createdAt" label="Time" width="170">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column prop="eventType" label="Event Type" width="140">
        <template #default="{ row }">
          <el-tag size="small">{{ row.eventType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="module" label="Module" width="120" />
      <el-table-column prop="operator" label="Operator" width="120" />
      <el-table-column prop="actionDetail" label="Detail" min-width="250" show-overflow-tooltip />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../api'

const audits = ref<any[]>([])
const loading = ref<boolean>(false)

const loadAudits = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/audits')
    audits.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

onMounted(loadAudits)
</script>

<style scoped>
.audit-view {
  padding: 20px;
}
</style>
