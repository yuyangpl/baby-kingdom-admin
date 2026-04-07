<template>
  <div class="poster-view">
    <div class="page-header">
      <h1 class="page-title">{{ $t('poster.history') }}</h1>
      <div class="queue-controls">
        <el-button type="success" :icon="VideoPlay" circle @click="resumeQueue" />
        <el-button :icon="VideoPause" circle @click="pauseQueue" />
      </div>
    </div>

    <!-- Metric Cards -->
    <el-row :gutter="16" class="metric-row">
      <el-col :span="8">
        <el-card class="metric-card card--info" shadow="never">
          <div class="metric-number">{{ metrics.waiting }}</div>
          <div class="metric-label">Waiting</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="metric-card card--success" shadow="never">
          <div class="metric-number metric-number--success">{{ metrics.success }}</div>
          <div class="metric-label">Success</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="metric-card card--danger" shadow="never">
          <div class="metric-number metric-number--danger">{{ metrics.failed }}</div>
          <div class="metric-label">Failed</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Pending Queue Table -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <span class="card-header-title">Pending Queue</span>
      </template>
      <el-table
        :data="pendingQueue"
        v-loading="loadingQueue"
        style="width: 100%"
        :header-cell-style="{ background: 'var(--bk-muted)', color: 'var(--bk-foreground)' }"
        highlight-current-row
      >
        <el-table-column prop="postId" label="Post ID" width="110" />
        <el-table-column prop="feedId" label="Feed ID" width="110" />
        <el-table-column prop="persona" label="Persona" width="120" />
        <el-table-column prop="board" label="Board" width="120" />
        <el-table-column prop="type" label="Type" width="90" />
        <el-table-column prop="scheduledAt" label="Scheduled" width="170">
          <template #default="{ row }">
            {{ row.scheduledAt ? new Date(row.scheduledAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('common.status')" width="100">
          <template #default>
            <el-tag type="primary" size="small" effect="light">Queued</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="" width="90" align="center">
          <template #default="{ row }">
            <el-button type="danger" size="small" link @click="cancelJob(row)">Cancel</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Post History Table -->
    <el-card shadow="never" class="table-card" style="margin-top: 20px;">
      <template #header>
        <span class="card-header-title">Post History</span>
      </template>
      <el-table
        :data="history"
        v-loading="loading"
        style="width: 100%"
        :header-cell-style="{ background: 'var(--bk-muted)', color: 'var(--bk-foreground)' }"
        highlight-current-row
      >
        <el-table-column prop="postId" label="Post ID" width="110" />
        <el-table-column prop="feedId" label="Feed ID" width="110" />
        <el-table-column prop="persona" label="Persona" width="120" />
        <el-table-column prop="board" label="Board" width="120" />
        <el-table-column prop="type" label="Type" width="90" />
        <el-table-column prop="postedAt" :label="$t('poster.posted')" width="170">
          <template #default="{ row }">
            {{ row.postedAt ? new Date(row.postedAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('common.status')" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'posted' || row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'info'"
              size="small"
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="Notes" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.postUrl" :href="row.postUrl" target="_blank" class="post-link">{{ row.postUrl }}</a>
            <span v-else-if="row.errorMessage" class="text-danger">{{ row.errorMessage }}</span>
            <span v-else class="text-muted">--</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, VideoPause } from '@element-plus/icons-vue'
import api from '../../api'

const history = ref<any[]>([])
const pendingQueue = ref<any[]>([])
const loading = ref(false)
const loadingQueue = ref(false)

const metrics = reactive({
  waiting: 0,
  success: 0,
  failed: 0,
})

const loadHistory = async () => {
  loading.value = true
  try {
    const res = await api.get('/v1/poster/history')
    const payload = res.data ?? res
    history.value = Array.isArray(payload) ? payload : (payload.data ?? [])
  } finally {
    loading.value = false
  }
}

const loadQueue = async () => {
  loadingQueue.value = true
  try {
    const res = await api.get('/v1/poster/queue')
    const payload = res.data ?? res
    pendingQueue.value = Array.isArray(payload) ? payload : (payload.data ?? [])
    metrics.waiting = pendingQueue.value.length
  } catch {
    // queue endpoint may not exist yet
  } finally {
    loadingQueue.value = false
  }
}

const loadMetrics = async () => {
  try {
    const res = await api.get('/v1/poster/metrics')
    const data = res.data ?? res
    metrics.waiting = data.waiting ?? 0
    metrics.success = data.success ?? data.completed ?? 0
    metrics.failed = data.failed ?? 0
  } catch {
    // metrics endpoint may not exist yet
  }
}

const resumeQueue = async () => {
  try {
    await api.post('/v1/poster/resume')
    ElMessage.success('Queue resumed')
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to resume queue')
  }
}

const pauseQueue = async () => {
  try {
    await api.post('/v1/poster/pause')
    ElMessage.success('Queue paused')
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to pause queue')
  }
}

const cancelJob = async (row: any) => {
  try {
    await api.delete(`/v1/poster/queue/${row.postId || row._id}`)
    ElMessage.success('Job cancelled')
    loadQueue()
    loadMetrics()
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to cancel job')
  }
}

onMounted(() => {
  loadHistory()
  loadQueue()
  loadMetrics()
})
</script>

<style scoped>
.poster-view {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.queue-controls {
  display: flex;
  gap: 8px;
}

.metric-row {
  margin-bottom: 20px;
}

.metric-card {
  text-align: center;
  border-radius: var(--bk-radius);
  padding: 8px 0;
}

.metric-number {
  font-size: 32px;
  font-weight: 700;
  color: var(--bk-primary);
  line-height: 1.2;
}

.metric-number--success {
  color: var(--bk-success);
}

.metric-number--danger {
  color: var(--bk-danger);
}

.metric-label {
  font-size: 13px;
  color: var(--bk-muted-fg);
  margin-top: 4px;
}

.table-card {
  border-radius: var(--bk-radius);
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.post-link {
  color: var(--bk-primary);
  text-decoration: none;
  font-size: 13px;
}

.post-link:hover {
  text-decoration: underline;
}

.text-danger {
  color: var(--bk-danger);
  font-size: 13px;
}

.text-muted {
  color: var(--bk-muted-fg);
}
</style>
