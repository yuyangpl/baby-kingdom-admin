<template>
  <div class="trends-view">
    <h2>Trends</h2>

    <el-button type="primary" :loading="pulling" @click="triggerPull" style="margin-bottom: 16px">
      Trigger Pull
    </el-button>

    <el-table :data="trends" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="pullId" label="Pull ID" width="120" />
      <el-table-column prop="source" label="Source" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="topicLabel" label="Topic" min-width="180" show-overflow-tooltip />
      <el-table-column prop="sentimentScore" label="Sentiment" width="110" />
      <el-table-column prop="sensitivityTier" label="Sensitivity" width="120" />
      <el-table-column prop="isUsed" label="Used" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isUsed ? 'success' : 'info'" size="small">{{ row.isUsed ? 'Yes' : 'No' }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'

const trends = ref<any[]>([])
const loading = ref<boolean>(false)
const pulling = ref<boolean>(false)

const loadTrends = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/trends')
    trends.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const triggerPull = async () => {
  pulling.value = true
  try {
    await api.post('/v1/trends/trigger')
    ElMessage.success('Pull triggered')
    loadTrends()
  } finally {
    pulling.value = false
  }
}

onMounted(loadTrends)
</script>

<style scoped>
.trends-view {
  padding: 20px;
}
</style>
