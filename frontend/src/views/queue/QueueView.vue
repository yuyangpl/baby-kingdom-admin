<template>
  <div class="queue-view">
    <div class="queue-view__header">
      <h2 class="page-title">{{ $t('queue.title') }}</h2>
      <div class="live-indicator">
        <span class="status-dot status-dot--active status-dot--pulse" />
        <span class="live-indicator__text">Live</span>
      </div>
    </div>

    <!-- Queue status cards -->
    <div class="queue-cards" v-loading="loading">
      <el-card
        v-for="q in queues"
        :key="q.name"
        shadow="hover"
        class="queue-card hover-lift"
      >
        <div class="queue-card__header">
          <span class="queue-card__name">{{ q.name }}</span>
          <el-tag
            :type="q.status === 'running' ? 'success' : q.status === 'paused' ? 'warning' : 'info'"
            size="small"
            effect="dark"
          >
            {{ q.status === 'running' ? 'Running' : q.status === 'paused' ? 'Paused' : 'Idle' }}
          </el-tag>
        </div>

        <div class="queue-card__metrics">
          <div class="metric">
            <span class="metric__label">{{ $t('queue.waiting') }}</span>
            <span class="metric__value">{{ q.waiting ?? 0 }}</span>
          </div>
          <div class="metric">
            <span class="metric__label">{{ $t('queue.active') }}</span>
            <span class="metric__value">{{ q.active ?? 0 }}</span>
          </div>
          <div class="metric">
            <span class="metric__label">{{ $t('queue.completed') }}</span>
            <span class="metric__value metric__value--success">{{ q.completed ?? 0 }}</span>
          </div>
          <div class="metric">
            <span class="metric__label">{{ $t('queue.failed') }}</span>
            <span class="metric__value metric__value--danger">{{ q.failed ?? 0 }}</span>
          </div>
        </div>

        <div v-if="q.nextRun" class="queue-card__next-run">
          <el-icon><Clock /></el-icon>
          <span>{{ formatDate(q.nextRun) }}</span>
        </div>

        <div class="queue-card__actions">
          <el-button
            v-if="q.status === 'running'"
            type="warning"
            size="small"
            plain
            @click="pauseQueue(q)"
          >
            {{ $t('queue.pause') }}
          </el-button>
          <el-button
            v-else
            type="success"
            size="small"
            plain
            @click="resumeQueue(q)"
          >
            {{ $t('queue.resume') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- Job history table -->
    <el-card shadow="never" class="queue-history" style="margin-top: 24px">
      <template #header>
        <span style="font-weight: 600">Job History</span>
      </template>

      <el-table :data="jobs" stripe border style="width: 100%">
        <el-table-column prop="jobId" label="Job ID" width="120">
          <template #default="{ row }">
            <code class="mono-id">{{ row.jobId ?? row.id }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="queue" label="Queue" width="150" />
        <el-table-column prop="startedAt" label="Started At" width="170">
          <template #default="{ row }">
            {{ row.startedAt ? formatDate(row.startedAt) : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="duration" label="Duration" width="100">
          <template #default="{ row }">
            {{ row.duration ? `${row.duration}ms` : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="Status" width="110">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'completed' ? 'success' : 'danger'"
              size="small"
              effect="dark"
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="triggeredBy" label="Triggered By" min-width="120" />
        <el-table-column label="Actions" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'failed'"
              size="small"
              plain
              @click="retryJob(row)"
            >
              Retry
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const queues = ref<any[]>([])
const jobs = ref<any[]>([])
const loading = ref<boolean>(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const formatDate = (d: string) => {
  return d ? new Date(d).toLocaleString() : '--'
}

const loadQueues = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/queues')
    queues.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const loadJobs = async () => {
  try {
    const { data } = await api.get('/v1/queues/jobs')
    jobs.value = data.data ?? data ?? []
  } catch {
    // endpoint may not exist yet
  }
}

const pauseQueue = async (q: any) => {
  await api.post(`/v1/queues/${q.name}/pause`)
  ElMessage.success(`${q.name} paused`)
  loadQueues()
}

const resumeQueue = async (q: any) => {
  await api.post(`/v1/queues/${q.name}/resume`)
  ElMessage.success(`${q.name} resumed`)
  loadQueues()
}

const retryJob = async (job: any) => {
  try {
    await api.post(`/v1/queues/jobs/${job.jobId ?? job.id}/retry`)
    ElMessage.success('Job retried')
    loadJobs()
  } catch (err: any) {
    ElMessage.error(err.message || 'Retry failed')
  }
}

onMounted(() => {
  loadQueues()
  loadJobs()
  pollTimer = setInterval(() => {
    loadQueues()
    loadJobs()
  }, 10000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.queue-view {
  padding: 24px;
}
.queue-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* Live indicator */
.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}
.live-indicator__text {
  font-size: 13px;
  font-weight: 600;
  color: var(--bk-success);
}

/* Queue cards grid */
.queue-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
@media (max-width: 1400px) {
  .queue-cards { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 900px) {
  .queue-cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .queue-cards { grid-template-columns: 1fr; }
}

.queue-card :deep(.el-card__body) {
  padding: 16px;
}
.queue-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.queue-card__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--bk-foreground);
}
.queue-card__metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}
.metric__label {
  font-size: 12px;
  color: var(--bk-muted-fg);
}
.metric__value {
  font-weight: 600;
  font-size: 14px;
  color: var(--bk-foreground);
}
.metric__value--success { color: var(--bk-success); }
.metric__value--danger { color: var(--bk-danger); }

.queue-card__next-run {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--bk-muted-fg);
}
.queue-card__actions {
  margin-top: 12px;
  text-align: right;
}

/* History */
.mono-id {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--bk-foreground);
  background: var(--bk-muted);
  padding: 2px 6px;
  border-radius: var(--bk-radius-sm);
}
</style>
