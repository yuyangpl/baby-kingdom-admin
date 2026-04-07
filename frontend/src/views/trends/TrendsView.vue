<template>
  <div class="trends-view">
    <h2>{{ $t('trends.title') }}</h2>

    <el-button type="primary" :loading="pulling" @click="triggerPull" style="margin-bottom: 16px">
      {{ $t('trends.triggerPull') }}
    </el-button>

    <el-table :data="trends" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="pullId" label="Pull ID" width="120" />
      <el-table-column prop="source" :label="$t('trends.source')" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="topicLabel" :label="$t('trends.topicLabel')" min-width="180" show-overflow-tooltip />
      <el-table-column prop="sentimentScore" :label="$t('trends.sentiment')" width="110" />
      <el-table-column prop="sensitivityTier" label="Sensitivity" width="120" />
      <el-table-column prop="isUsed" :label="$t('trends.used')" width="80">
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
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

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
    ElMessage.success(t('trends.triggerPull'))
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
