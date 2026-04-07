<template>
  <div class="scanner-view">
    <div class="page-header">
      <h1 class="page-title">{{ $t('scanner.title') }}</h1>
      <el-button
        type="primary"
        :loading="triggering"
        :disabled="scanStatus === 'running'"
        @click="triggerScan"
      >
        {{ $t('scanner.triggerScan') }}
      </el-button>
    </div>

    <!-- Status Card -->
    <el-card class="status-card" shadow="never">
      <div class="status-grid">
        <div class="status-item">
          <span class="status-label">{{ $t('common.status') }}</span>
          <span class="status-value">
            <span
              class="status-dot"
              :class="[
                scanStatus === 'running' ? 'status-dot--running status-dot--pulse' : 'status-dot--idle'
              ]"
            />
            <el-tag :type="scanStatus === 'running' ? 'success' : 'info'" size="small">
              {{ scanStatus === 'running' ? 'Running' : 'Idle' }}
            </el-tag>
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">Last Scan</span>
          <span class="status-value">{{ lastScanTime || '--' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Next Scheduled</span>
          <span class="status-value">{{ nextScheduled || '--' }}</span>
        </div>
      </div>
    </el-card>

    <!-- Scan History Table -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <span class="card-header-title">Scan History</span>
      </template>
      <el-table
        :data="history"
        v-loading="loading"
        style="width: 100%"
        :header-cell-style="{ background: 'var(--bk-muted)', color: 'var(--bk-foreground)' }"
        highlight-current-row
      >
        <el-table-column prop="startedAt" label="Time" width="170">
          <template #default="{ row }">
            {{ row.startedAt ? new Date(row.startedAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="duration" label="Duration" width="110">
          <template #default="{ row }">
            {{ row.duration ? `${row.duration}s` : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="boardsScanned" label="Boards" width="90" align="center" />
        <el-table-column prop="threadsScanned" label="Threads" width="100" align="center" />
        <el-table-column prop="hits" label="Hits" width="90" align="center">
          <template #default="{ row }">
            <span class="text-success">{{ row.hits ?? 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="feedsCreated" label="Feeds" width="90" align="center" />
        <el-table-column prop="status" :label="$t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'completed' ? 'success' : row.status === 'error' ? 'danger' : 'info'"
              size="small"
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper" v-if="pagination.pages > 1">
        <el-pagination
          v-model:current-page="pagination.page"
          :page-size="pagination.limit"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="loadHistory"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const history = ref<any[]>([])
const loading = ref(false)
const triggering = ref(false)
const scanStatus = ref<string>('idle')
const lastScanTime = ref<string>('')
const nextScheduled = ref<string>('')
const pagination = reactive({ page: 1, limit: 20, total: 0, pages: 0 })

const loadHistory = async () => {
  loading.value = true
  try {
    const res: any = await api.get('/v1/scanner/history', {
      params: { page: pagination.page, limit: pagination.limit }
    })
    const payload = res.data ?? res
    history.value = Array.isArray(payload) ? payload : (payload.data ?? [])
    if (res.pagination) {
      Object.assign(pagination, res.pagination)
    }
    // Derive status from latest record
    if (history.value.length > 0) {
      const latest = history.value[0]
      lastScanTime.value = latest.startedAt ? new Date(latest.startedAt).toLocaleString() : ''
    }
  } finally {
    loading.value = false
  }
}

const loadStatus = async () => {
  try {
    const res = await api.get('/v1/scanner/status')
    const data = res.data ?? res
    scanStatus.value = data.status || 'idle'
    if (data.nextScheduled) {
      nextScheduled.value = new Date(data.nextScheduled).toLocaleString()
    }
  } catch {
    // status endpoint may not exist yet
  }
}

const triggerScan = async () => {
  triggering.value = true
  scanStatus.value = 'running'
  try {
    await api.post('/v1/scanner/trigger')
    ElMessage.success(t('scanner.triggerScan'))
    loadHistory()
  } finally {
    triggering.value = false
    scanStatus.value = 'idle'
  }
}

onMounted(() => {
  loadHistory()
  loadStatus()
})
</script>

<style scoped>
.scanner-view {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status-card {
  margin-bottom: 20px;
  border-radius: var(--bk-radius);
}

.status-grid {
  display: flex;
  gap: 48px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-label {
  font-size: 12px;
  color: var(--bk-muted-fg);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-value {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--bk-foreground);
}

.table-card {
  border-radius: var(--bk-radius);
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.text-success {
  color: var(--bk-success);
  font-weight: 600;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
