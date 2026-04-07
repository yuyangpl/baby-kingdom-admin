<template>
  <div class="scanner-view">
    <h2>{{ $t('scanner.title') }}</h2>

    <el-button type="primary" :loading="triggering" @click="triggerScan" style="margin-bottom: 16px">
      {{ $t('scanner.triggerScan') }}
    </el-button>

    <el-table :data="history" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="feedId" label="Feed ID" width="120" />
      <el-table-column prop="threadSubject" label="Thread Subject" min-width="200" show-overflow-tooltip />
      <el-table-column prop="relevanceScore" label="Relevance" width="110" />
      <el-table-column prop="status" :label="$t('common.status')" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'matched' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" :label="$t('common.createdAt')" width="170">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
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

const history = ref<any[]>([])
const loading = ref<boolean>(false)
const triggering = ref<boolean>(false)

const loadHistory = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/scanner/history')
    history.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const triggerScan = async () => {
  triggering.value = true
  try {
    await api.post('/v1/scanner/trigger')
    ElMessage.success(t('scanner.triggerScan'))
    loadHistory()
  } finally {
    triggering.value = false
  }
}

onMounted(loadHistory)
</script>

<style scoped>
.scanner-view {
  padding: 20px;
}
</style>
