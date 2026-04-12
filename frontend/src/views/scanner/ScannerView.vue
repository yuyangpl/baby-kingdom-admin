<template>
  <div class="scanner-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ $t('scanner.title') }}</h1>
        <p class="page-desc">{{ $t('scanner.desc') }}</p>
      </div>
      <el-button
        type="primary"
        :loading="triggering"
        :disabled="scanStatus === 'running' || queuePaused"
        @click="triggerScan"
      >
        {{ $t('scanner.triggerScan') }}
      </el-button>
    </div>

    <el-alert v-if="queuePaused" :title="$t('scanner.queuePaused')" type="warning" show-icon :closable="false" style="margin-bottom: 16px;" />

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
              {{ scanStatus === 'running' ? $t('scanner.running') : $t('scanner.idle') }}
            </el-tag>
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">{{ $t('scanner.lastScan') }}</span>
          <span class="status-value">{{ lastScanTime || '--' }}</span>
        </div>
      </div>
    </el-card>

    <!-- Scan Records Table -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <span class="card-header-title">{{ $t('scanner.scanHistory') }}</span>
      </template>
      <el-table
        :data="records"
        v-loading="loading"
        style="width: 100%"
        highlight-current-row
      >
        <el-table-column prop="createdAt" :label="$t('common.time')" min-width="170">
          <template #default="{ row }">
            {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="duration" :label="$t('scanner.duration')" min-width="100">
          <template #default="{ row }">
            {{ row.duration ? `${(row.duration / 1000).toFixed(1)}s` : '--' }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('feed.board')" min-width="130">
          <template #default="{ row }">
            <template v-if="row.result?.boardName">
              <el-tag size="small" type="info" effect="plain">{{ row.result.boardName }}</el-tag>
            </template>
            <template v-else-if="row.result?.boards !== undefined">
              {{ row.result.boards }} 個版塊
            </template>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('scanner.scanned')" min-width="90" align="center">
          <template #default="{ row }">
            {{ row.result?.scanned ?? getScanTotal(row, 'scanned') }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('scanner.hits')" min-width="80" align="center">
          <template #default="{ row }">
            <span class="text-success">{{ row.result?.hits ?? getScanTotal(row, 'hits') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('scanner.feedsCreated')" min-width="110" align="center">
          <template #default="{ row }">
            <el-button
              v-if="(row.result?.feeds ?? getScanTotal(row, 'feeds')) > 0"
              link
              type="primary"
              @click.stop="openFeedDialog(row)"
            >
              {{ row.result?.feeds ?? getScanTotal(row, 'feeds') }}
            </el-button>
            <span v-else>{{ row.result?.feeds ?? getScanTotal(row, 'feeds') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('scanner.triggeredBy')" min-width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.triggeredBy === 'manual' ? 'warning' : 'info'" effect="plain">
              {{ row.triggeredBy }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('common.status')" min-width="100">
          <template #default="{ row }">
            <el-tag
              :type="scanRecordStatusType(row)"
              size="small"
            >
              {{ scanRecordStatusLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="row.result?.skipped" style="padding: 8px 20px; font-size: 13px; color: #909399;">
              {{ $t('scanner.skippedDetail') }}:
              {{ $t('scanner.skipQueueFull') }}: {{ row.result.skipped.queueFull }},
              {{ $t('scanner.skipReplyCount') }}: {{ row.result.skipped.replyCount }},
              {{ $t('scanner.skipDuplicate') }}: {{ row.result.skipped.duplicate }},
              {{ $t('scanner.skipLowRelevance') }}: {{ row.result.skipped.lowRelevance }},
              {{ $t('scanner.skipNotWorth') }}: {{ row.result.skipped.notWorth }},
              {{ $t('scanner.skipNoPersona') }}: {{ row.result.skipped.noPersona }}
            </div>
            <div v-if="row.error" style="padding: 8px 20px; color: var(--el-color-danger);">
              {{ row.error }}
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper" v-if="pagination.pages > 1">
        <el-pagination
          v-model:current-page="pagination.page"
          :page-size="pagination.limit"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="loadRecords"
        />
      </div>
    </el-card>

    <!-- Feed Detail Dialog -->
    <el-dialog
      v-model="showFeedDialog"
      :title="$t('scanner.scannedFeeds')"
      width="900px"
    >
      <el-table :data="dialogFeeds" v-loading="dialogLoading" style="width: 100%" @row-click="openThreadDetail">
        <el-table-column prop="feedId" label="Feed ID" width="130">
          <template #default="{ row }">
            <code class="mono">{{ row.feedId }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="threadFid" :label="$t('feed.board')" width="130">
          <template #default="{ row }">
            <el-tag v-if="row.threadFid" size="small" type="info" effect="plain">
              {{ boardMap[row.threadFid] || `fid:${row.threadFid}` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="threadSubject" :label="$t('scanner.threadSubject')" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="thread-link">{{ row.threadSubject || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="personaId" :label="$t('feed.persona')" width="110" />
        <el-table-column prop="relevanceScore" :label="$t('scanner.relevance')" width="80" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="row.relevanceScore != null"
              :type="row.relevanceScore >= 70 ? 'success' : row.relevanceScore >= 50 ? 'warning' : 'info'"
              size="small"
            >{{ row.relevanceScore }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('common.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="feedStatusType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- Thread Content Dialog -->
    <el-dialog
      v-model="showThreadDetail"
      :title="threadDetailRow?.threadSubject || ''"
      width="700px"
    >
      <div v-if="threadDetailRow" class="detail-content">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="Feed ID"><code>{{ threadDetailRow.feedId }}</code></el-descriptions-item>
          <el-descriptions-item :label="$t('common.status')">
            <el-tag :type="feedStatusType(threadDetailRow.status)" size="small">{{ threadDetailRow.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('feed.board')">
            {{ boardMap[threadDetailRow.threadFid] || `fid:${threadDetailRow.threadFid}` }}
          </el-descriptions-item>
          <el-descriptions-item label="TID">
            <a v-if="threadDetailRow.threadTid" :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${threadDetailRow.threadTid}`" target="_blank" rel="noopener">
              {{ threadDetailRow.threadTid }} ↗
            </a>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('feed.persona')">{{ threadDetailRow.personaId || '--' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('feed.toneMode')">{{ threadDetailRow.toneMode || '--' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="threadDetailRow.threadContent" class="detail-section">
          <h4>{{ $t('scanner.originalContent') }}</h4>
          <div class="detail-text">{{ threadDetailRow.threadContent }}</div>
        </div>
        <div v-if="threadDetailRow.draftContent" class="detail-section">
          <h4>{{ $t('scanner.generatedReply') }}</h4>
          <div class="detail-text">{{ threadDetailRow.draftContent }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const records = ref<any[]>([])
const loading = ref(false)
const triggering = ref(false)
const scanStatus = ref<string>('idle')
const queuePaused = ref(false)
const lastScanTime = ref<string>('')
const pagination = reactive({ page: 1, limit: 20, total: 0, pages: 0 })
const boardMap = ref<Record<number, string>>({})

// Feed dialog
const showFeedDialog = ref(false)
const dialogFeeds = ref<any[]>([])
const dialogLoading = ref(false)

// Thread detail dialog
const showThreadDetail = ref(false)
const threadDetailRow = ref<any>(null)

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

const loadRecords = async () => {
  loading.value = true
  try {
    const res: any = await api.get('/v1/task-logs/scanner', {
      params: { page: pagination.page, limit: pagination.limit }
    })
    const payload = res.data ?? res
    records.value = Array.isArray(payload) ? payload : (payload.data ?? [])
    if (res.pagination) Object.assign(pagination, res.pagination)
    if (records.value.length > 0 && records.value[0].createdAt) {
      lastScanTime.value = new Date(records.value[0].createdAt).toLocaleString()
    }
  } finally {
    loading.value = false
  }
}

const loadStatus = async () => {
  try {
    const res: any = await api.get('/v1/task-logs/scanner/latest')
    const data = res.data ?? res
    scanStatus.value = data?.status === 'running' ? 'running' : 'idle'
  } catch {
    scanStatus.value = 'idle'
  }
  queuePaused.value = false
}

const triggerScan = async () => {
  triggering.value = true
  scanStatus.value = 'running'
  try {
    await api.post('/v1/scanner/trigger')
    ElMessage.success(t('scanner.scanQueued'))
    setTimeout(() => loadRecords(), 5000)
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    triggering.value = false
    setTimeout(() => {
      scanStatus.value = 'idle'
      loadRecords()
    }, 15000)
  }
}

// 批量扫描时从 results 数组汇总统计
const getScanTotal = (row: any, field: string): number => {
  if (!row.result?.results) return 0
  return row.result.results.reduce((sum: number, r: any) => sum + (r[field] ?? 0), 0)
}

const openFeedDialog = async (row: any) => {
  showFeedDialog.value = true
  dialogLoading.value = true
  try {
    const from = row.createdAt
    const duration = row.duration || 60000
    const to = new Date(new Date(from).getTime() + duration).toISOString()
    const res: any = await api.get('/v1/scanner/history', { params: { from, to, limit: 50 } })
    const payload = res.data ?? res
    dialogFeeds.value = Array.isArray(payload) ? payload : (payload.data ?? [])
  } catch {
    dialogFeeds.value = []
  } finally {
    dialogLoading.value = false
  }
}

const openThreadDetail = async (row: any) => {
  try {
    const res: any = await api.get(`/v1/feeds/${row.feedId}`)
    threadDetailRow.value = res.data || res
  } catch {
    threadDetailRow.value = row
  }
  showThreadDetail.value = true
}

const scanRecordStatusType = (row: any): string => {
  if (row.status === 'failed') return 'danger'
  if (row.result?.status === 'interrupted') return 'warning'
  if (row.result?.status === 'skipped') return 'info'
  if (row.status === 'completed') return 'success'
  return 'info'
}

const scanRecordStatusLabel = (row: any): string => {
  if (row.status === 'failed') return t('common.failed') || 'failed'
  if (row.result?.status === 'interrupted') return t('scanner.interrupted') || 'interrupted'
  if (row.result?.status === 'skipped') return t('scanner.skippedStatus') || 'skipped'
  return row.status
}

const feedStatusType = (status: string): string => {
  const map: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', posted: 'info', failed: 'danger' }
  return map[status] || ''
}

onMounted(() => {
  loadRecords()
  loadStatus()
  loadBoards()
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.page-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--bk-muted-fg, #909399);
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

.mono {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  font-size: 12px;
}

.thread-link {
  cursor: pointer;
  color: var(--el-color-primary);
}

.thread-link:hover {
  text-decoration: underline;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-content {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  margin-top: 16px;
}

.detail-section h4 {
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--bk-muted-fg);
}

.detail-text {
  background: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 4px;
  line-height: 1.6;
  white-space: pre-wrap;
  font-size: 13px;
}
</style>
