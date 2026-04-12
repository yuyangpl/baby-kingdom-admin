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
          <div class="metric-label">{{ $t('poster.waiting') }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="metric-card card--success" shadow="never">
          <div class="metric-number metric-number--success">{{ metrics.success }}</div>
          <div class="metric-label">{{ $t('poster.success') }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="metric-card card--danger" shadow="never">
          <div class="metric-number metric-number--danger">{{ metrics.failed }}</div>
          <div class="metric-label">{{ $t('queue.failed') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Pending Queue Table -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <span class="card-header-title">{{ $t('poster.pendingQueue') }}</span>
      </template>
      <el-table
        :data="pendingQueue"
        v-loading="loadingQueue"
        style="width: 100%"
        highlight-current-row
        @expand-change="(row: any, expanded: any[]) => { if (expanded.length) loadExpandData(row.data?.feedId) }"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="expandData[row.data?.feedId]" class="expand-detail">
              <div class="expand-detail__row">
                <div class="expand-detail__persona">
                  <span class="expand-detail__label">{{ $t('feed.persona') }}</span>
                  <strong>{{ expandData[row.data.feedId].personaId }}</strong>
                  <span v-if="expandData[row.data.feedId].bkUsername" class="expand-detail__sub">{{ expandData[row.data.feedId].bkUsername }}</span>
                  <el-tag v-if="expandData[row.data.feedId].archetype" size="small" effect="plain" style="margin-left: 6px;">
                    {{ expandData[row.data.feedId].archetype }}
                  </el-tag>
                </div>
                <div>
                  <span class="expand-detail__label">{{ $t('feed.toneMode') }}</span>
                  <span>{{ toneLabel(expandData[row.data.feedId].toneMode) }}</span>
                </div>
              </div>
              <el-descriptions :column="2" border size="small" style="margin-top: 10px;">
                <el-descriptions-item :label="$t('feed.threadSubject')">
                  {{ expandData[row.data.feedId].subject || expandData[row.data.feedId].threadSubject || '--' }}
                  <a v-if="expandData[row.data.feedId].threadTid" :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${expandData[row.data.feedId].threadTid}`" target="_blank" rel="noopener" style="margin-left: 6px; font-size: 12px;">{{ $t('feed.viewThread') }} ↗</a>
                </el-descriptions-item>
                <el-descriptions-item :label="$t('feed.board')">
                  {{ boardMap[expandData[row.data.feedId].threadFid] || `fid:${expandData[row.data.feedId].threadFid}` }}
                </el-descriptions-item>
              </el-descriptions>
              <div v-if="expandData[row.data.feedId].draftContent" style="margin-top: 12px;">
                <strong style="font-size: 13px; color: #909399;">{{ $t('feed.content') }}</strong>
                <div class="expand-text">{{ expandData[row.data.feedId].finalContent || expandData[row.data.feedId].draftContent }}</div>
              </div>
            </div>
            <div v-else style="padding: 12px 20px; color: #909399;">{{ $t('common.loading') }}...</div>
          </template>
        </el-table-column>
        <el-table-column :label="$t('feed.feedId')" min-width="130">
          <template #default="{ row }">
            <code class="mono">{{ row.data?.feedIdShort || '--' }}</code>
          </template>
        </el-table-column>
        <el-table-column :label="$t('feed.persona')" min-width="120">
          <template #default="{ row }">
            {{ row.data?.personaId || '--' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('feed.board')" min-width="130">
          <template #default="{ row }">
            <el-tag v-if="row.data?.boardFid" size="small" type="info" effect="plain">
              {{ boardMap[row.data.boardFid] || `fid:${row.data.boardFid}` }}
            </el-tag>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('poster.type')" min-width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.data?.postType === 'new-post' ? 'warning' : 'info'" effect="plain">
              {{ row.data?.postType || '--' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('poster.addedAt')" min-width="170">
          <template #default="{ row }">
            {{ row.addedAt ? new Date(row.addedAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.status')" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'primary'" size="small" effect="light">
              {{ row.status === 'active' ? $t('poster.posting') : $t('poster.queued') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" min-width="140" align="center">
          <template #default="{ row }">
            <el-button type="success" size="small" link @click="manualPost(row)">{{ $t('feed.postNow') }}</el-button>
            <el-button type="danger" size="small" link @click="cancelJob(row)">{{ $t('common.cancel') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Post History Table -->
    <el-card shadow="never" class="table-card" style="margin-top: 20px;">
      <template #header>
        <span class="card-header-title">{{ $t('poster.postHistory') }}</span>
      </template>
      <el-table
        :data="history"
        v-loading="loading"
        style="width: 100%"
        highlight-current-row
        @expand-change="(row: any, expanded: any[]) => { if (expanded.length) loadExpandData(row.id || row._id) }"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="expandData[row.id || row._id]" class="expand-detail">
              <div class="expand-detail__row">
                <div class="expand-detail__persona">
                  <span class="expand-detail__label">{{ $t('feed.persona') }}</span>
                  <strong>{{ expandData[row.id || row._id].personaId }}</strong>
                  <span v-if="expandData[row.id || row._id].bkUsername" class="expand-detail__sub">{{ expandData[row.id || row._id].bkUsername }}</span>
                  <el-tag v-if="expandData[row.id || row._id].archetype" size="small" effect="plain" style="margin-left: 6px;">
                    {{ expandData[row.id || row._id].archetype }}
                  </el-tag>
                </div>
                <div>
                  <span class="expand-detail__label">{{ $t('feed.toneMode') }}</span>
                  <span>{{ toneLabel(expandData[row.id || row._id].toneMode) }}</span>
                </div>
              </div>
              <el-descriptions :column="2" border size="small" style="margin-top: 10px;">
                <el-descriptions-item :label="$t('feed.threadSubject')">
                  {{ expandData[row.id || row._id].subject || expandData[row.id || row._id].threadSubject || '--' }}
                  <a v-if="expandData[row.id || row._id].threadTid" :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${expandData[row.id || row._id].threadTid}`" target="_blank" rel="noopener" style="margin-left: 6px; font-size: 12px;">{{ $t('feed.viewThread') }} ↗</a>
                </el-descriptions-item>
                <el-descriptions-item :label="$t('feed.board')">
                  {{ boardMap[expandData[row.id || row._id].threadFid] || `fid:${expandData[row.id || row._id].threadFid}` }}
                </el-descriptions-item>
              </el-descriptions>
              <div v-if="expandData[row.id || row._id].finalContent || expandData[row.id || row._id].draftContent" style="margin-top: 12px;">
                <strong style="font-size: 13px; color: #909399;">{{ $t('feed.content') }}</strong>
                <div class="expand-text">{{ expandData[row.id || row._id].finalContent || expandData[row.id || row._id].draftContent }}</div>
              </div>
            </div>
            <div v-else style="padding: 12px 20px; color: #909399;">{{ $t('common.loading') }}...</div>
          </template>
        </el-table-column>
        <el-table-column :label="$t('feed.feedId')" min-width="130">
          <template #default="{ row }">
            <code class="mono">{{ row.feedId || '--' }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="personaId" :label="$t('feed.persona')" min-width="120" />
        <el-table-column :label="$t('feed.board')" min-width="130">
          <template #default="{ row }">
            <el-tag v-if="row.threadFid" size="small" type="info" effect="plain">
              {{ boardMap[row.threadFid] || `fid:${row.threadFid}` }}
            </el-tag>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('poster.type')" min-width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.postType === 'new-post' ? 'warning' : 'info'" effect="plain">
              {{ row.postType || row.type || '--' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('poster.posted')" min-width="170">
          <template #default="{ row }">
            {{ row.postedAt ? new Date(row.postedAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.status')" min-width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'posted' ? 'success' : row.status === 'failed' ? 'danger' : 'info'"
              size="small"
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('poster.notes')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.postUrl" :href="row.postUrl" target="_blank" class="post-link">{{ row.postUrl }}</a>
            <span v-else-if="row.failReason" class="text-danger">{{ row.failReason }}</span>
            <span v-else class="text-muted">--</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay, VideoPause } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const history = ref<any[]>([])
const pendingQueue = ref<any[]>([])
const loading = ref(false)
const loadingQueue = ref(false)

const metrics = reactive({
  waiting: 0,
  success: 0,
  failed: 0,
})
const boardMap = ref<Record<number, string>>({})
const expandData = ref<Record<string, any>>({})
const tones = ref<{ toneId: string; displayName: string }[]>([])

const loadTones = async () => {
  try {
    const res = await api.get('/v1/tones')
    tones.value = (res.data || res).map((t: any) => ({ toneId: t.toneId, displayName: t.displayName }))
  } catch { /* ignore */ }
}

const toneLabel = (toneId: string): string => {
  if (!toneId) return '--'
  const t = tones.value.find(t => t.toneId === toneId)
  return t ? t.displayName : toneId
}

const loadBoards = async () => {
  try {
    const res: any = await api.get('/v1/forums')
    const tree = res.data || res
    const map: Record<number, string> = {}
    for (const cat of (Array.isArray(tree) ? tree : [])) {
      for (const b of (cat.boards || [])) {
        map[b.fid] = b.name
      }
    }
    boardMap.value = map
  } catch { /* ignore */ }
}

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
  pendingQueue.value = []
  loadingQueue.value = false
}

const loadMetrics = async () => {
  try {
    const res: any = await api.get('/v1/task-logs/poster', { params: { limit: 100 } })
    const logs = res.data ?? []
    metrics.success = logs.filter((l: any) => l.status === 'completed').length
    metrics.failed = logs.filter((l: any) => l.status === 'failed').length
    metrics.waiting = 0
  } catch {
    metrics.waiting = 0
    metrics.success = 0
    metrics.failed = 0
  }
}

const resumeQueue = async () => {
  ElMessage.info('Queue module removed')
}

const pauseQueue = async () => {
  ElMessage.info('Queue module removed')
}

const loadExpandData = async (feedId: string) => {
  if (!feedId || expandData.value[feedId]) return
  try {
    const res: any = await api.get(`/v1/feeds/${feedId}`)
    expandData.value = { ...expandData.value, [feedId]: res.data || res }
  } catch { /* ignore */ }
}

const manualPost = async (row: any) => {
  const feedId = row.feedId || row.data?.feedId
  if (!feedId) { ElMessage.error('No feedId'); return }

  const detail = expandData.value[feedId]
  const subject = detail?.subject || detail?.threadSubject || row.data?.feedIdShort || feedId
  try {
    await ElMessageBox.confirm(
      t('poster.postConfirmMsg', { subject }),
      t('feed.postNow'),
      { confirmButtonText: t('feed.postNow'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await api.post(`/v1/poster/${feedId}/post`)
    ElMessage.success(t('feed.postQueued'))
    loadQueue()
    loadHistory()
    loadMetrics()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const cancelJob = async (_row: any) => {
  ElMessage.info('Queue module removed')
}

onMounted(() => {
  loadHistory()
  loadQueue()
  loadMetrics()
  loadBoards()
  loadTones()
})
</script>

<style scoped>
.poster-view {
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

.mono {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  font-size: 12px;
}

.expand-detail {
  padding: 12px 20px;
}

.expand-detail__row {
  display: flex;
  gap: 32px;
  align-items: center;
  margin-bottom: 4px;
}

.expand-detail__persona {
  display: flex;
  align-items: center;
  gap: 6px;
}

.expand-detail__label {
  font-size: 12px;
  color: #909399;
  margin-right: 4px;
}

.expand-detail__sub {
  color: #909399;
  font-size: 12px;
}

.expand-text {
  background: var(--el-fill-color-lighter);
  padding: 10px 12px;
  border-radius: 4px;
  line-height: 1.6;
  white-space: pre-wrap;
  font-size: 13px;
  margin-top: 6px;
  max-height: 200px;
  overflow-y: auto;
}
</style>
