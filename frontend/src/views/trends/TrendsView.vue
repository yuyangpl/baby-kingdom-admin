<template>
  <div class="trends-view">
    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
      <div>
        <h1 class="page-title" style="margin: 0;">{{ $t('trends.title') }}</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #909399;">
          {{ $t('trends.desc') }}
          <span v-if="pullIntervalMin" style="margin-left: 4px;">{{ $t('trends.pullInterval', { minutes: pullIntervalMin }) }}</span>
        </p>
        <div class="token-status-inline" :class="tokenValid ? 'token--valid' : 'token--expired'" style="margin-top: 6px;">
          <el-icon :size="14" :color="tokenValid ? 'var(--bk-success)' : 'var(--bk-danger)'">
            <CircleCheckFilled v-if="tokenValid" />
            <WarningFilled v-else />
          </el-icon>
          <span>{{ tokenValid ? $t('trends.tokenValidUntil', { date: tokenExpiry }) : $t('trends.tokenExpiredOrMissing') }}</span>
        </div>
      </div>
      <el-button type="primary" :loading="pulling" :disabled="queuePaused" @click="triggerPull">
        {{ $t('trends.triggerPull') }}
      </el-button>
    </div>
    <el-alert v-if="queuePaused" :title="$t('trends.queuePaused')" type="warning" show-icon :closable="false" style="margin-bottom: 16px;" />

    <!-- Source Tabs -->
    <el-tabs v-model="activeSource" @tab-change="onSourceChange" class="trends-tabs">
      <el-tab-pane v-for="tab in sourceTabs" :key="tab.value" :name="tab.value">
        <template #label>{{ tab.label }}</template>
      </el-tab-pane>
    </el-tabs>

    <!-- Trends Table -->
    <el-card shadow="never" class="table-card">
      <el-table
        :data="trends"
        v-loading="loading"
        style="width: 100%"
        highlight-current-row
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div style="padding: 12px 20px;">
              <div v-if="row.summary" style="margin-bottom: 8px;">
                <strong>{{ $t('trends.summary') }}:</strong> {{ row.summary }}
              </div>
              <div v-if="row.engagements" style="margin-bottom: 8px;">
                <strong>{{ $t('trends.engagements') }}:</strong> {{ row.engagements?.toLocaleString() }}
                <span v-if="row.postCount" style="margin-left: 12px;">
                  <strong>{{ $t('trends.postCount') }}:</strong> {{ row.postCount?.toLocaleString() }}
                </span>
              </div>
              <div v-if="row.rawData" style="margin-top: 8px;">
                <strong>{{ $t('trends.rawData') }}:</strong>
                <pre style="background: #f5f7fa; padding: 8px 12px; border-radius: 4px; max-height: 300px; overflow: auto; font-size: 12px; margin-top: 4px;">{{ JSON.stringify(row.rawData, null, 2) }}</pre>
              </div>
              <div v-if="!row.rawData && !row.summary" style="color: #909399;">{{ $t('common.noData') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="pullId" :label="$t('trends.pullId')" width="110">
          <template #default="{ row }">
            <code class="mono">{{ row.pullId }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" :label="$t('common.time')" width="170">
          <template #default="{ row }">
            {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="rank" :label="$t('trends.rank')" width="70" align="center" />
        <el-table-column prop="topicLabel" :label="$t('trends.topicLabel')" min-width="180" show-overflow-tooltip />
        <el-table-column prop="sentimentScore" width="120">
          <template #header>
            {{ $t('trends.sentiment') }}
            <el-tooltip placement="top">
              <template #content>
                <div style="line-height: 1.6;" v-html="$t('trends.sentimentTooltip')"></div>
              </template>
              <el-icon :size="14" style="margin-left: 4px; vertical-align: middle; color: #909399; cursor: help;"><QuestionFilled /></el-icon>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <el-tag :type="sentimentTagType(row.sentimentScore)" size="small">
              {{ sentimentLabel(row.sentimentScore) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sensitivityTier" width="80" align="center">
          <template #header>
            {{ $t('trends.tier') }}
            <el-tooltip placement="top">
              <template #content>
                <div style="line-height: 1.6;" v-html="$t('trends.tierTooltip')"></div>
              </template>
              <el-icon :size="14" style="margin-left: 4px; vertical-align: middle; color: #909399; cursor: help;"><QuestionFilled /></el-icon>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span
              v-if="row.sensitivityTier"
              class="tier-badge"
              :class="`tier-badge--${row.sensitivityTier}`"
            >
              T{{ row.sensitivityTier }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="feedIds" :label="$t('trends.feedIds')" min-width="140">
          <template #default="{ row }">
            <span v-if="row.feedIds && row.feedIds.length">
              <a
                v-for="fid in row.feedIds"
                :key="fid"
                class="feed-link"
                @click.prevent
              >
                {{ fid }}
              </a>
            </span>
            <span v-else class="text-muted">--</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper" v-if="pagination.pages > 1">
        <el-pagination
          v-model:current-page="pagination.page"
          :page-size="pagination.limit"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="loadTrends"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { CircleCheckFilled, WarningFilled, QuestionFilled } from '@element-plus/icons-vue'
import api from '../../api'

const { t } = useI18n()

const trends = ref<any[]>([])
const loading = ref(false)
const pulling = ref(false)
const queuePaused = ref(false)
const pullIntervalMin = ref(0)
const tokenValid = ref(true)
const tokenExpiry = ref('')

const pagination = reactive({ page: 1, limit: 20, total: 0, pages: 0 })

const activeSource = ref('fb')
const sourceTabs = [
  { value: 'fb', label: 'Facebook / Instagram' },
  { value: 'lihkg', label: 'LIHKG' },
]

const onSourceChange = () => {
  pagination.page = 1
  loadTrends()
}

const loadSourceConfig = async () => {
  try {
    const res = await api.get('/v1/configs/medialens')
    const configs = res.data || res
    for (const c of configs) {
      if (c.key === 'TREND_PULL_INTERVAL_MIN') pullIntervalMin.value = parseInt(c.value, 10) || 60
    }
  } catch { /* keep defaults */ }
}

const sentimentTagType = (score: number | undefined): string => {
  if (score == null) return 'info'
  if (score >= 60) return 'success'
  if (score <= 40) return 'danger'
  return 'info'
}

const sentimentLabel = (score: number | undefined): string => {
  if (score == null) return 'neutral'
  if (score >= 60) return 'positive'
  if (score <= 40) return 'negative'
  return 'neutral'
}

const loadTrends = async () => {
  loading.value = true
  try {
    const params: Record<string, any> = { page: pagination.page, limit: pagination.limit }
    if (activeSource.value === 'fb') {
      params.source = 'medialens,facebook'
    } else {
      params.source = activeSource.value
    }
    const res: any = await api.get('/v1/trends', { params })
    const payload = res.data ?? res
    trends.value = Array.isArray(payload) ? payload : (payload.data ?? [])
    if (res.pagination) {
      Object.assign(pagination, res.pagination)
    }
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' })
  } finally {
    loading.value = false
  }
}

const loadTokenStatus = async () => {
  try {
    const res: any = await api.get('/v1/trends/medialens/token-status')
    const data = res.data ?? res
    tokenValid.value = !!data.hasToken
    tokenExpiry.value = data.expiresAt ? new Date(data.expiresAt).toLocaleString() : (data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '')
  } catch {
    tokenValid.value = false
    tokenExpiry.value = ''
  }
}

const loadQueueStatus = async () => {
  queuePaused.value = false
}

const triggerPull = async () => {
  if (queuePaused.value) {
    ElMessage.warning(t('trends.queuePaused'))
    return
  }
  pulling.value = true
  try {
    await api.post('/v1/trends/trigger')
    ElMessage.success(t('trends.pullTriggered'))
    loadTrends()
  } finally {
    pulling.value = false
  }
}

onMounted(() => {
  loadSourceConfig()
  loadTrends()
  loadTokenStatus()
  loadQueueStatus()
})
</script>

<style scoped>
.trends-view {
}

.trends-tabs {
  margin-bottom: 16px;
}

.token-status-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.token--valid {
  color: var(--bk-success);
}

.token--expired {
  color: var(--bk-danger);
}

.table-card {
  border-radius: var(--bk-radius);
}

.mono {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--bk-muted-fg);
}

.tier-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 22px;
  border-radius: var(--bk-radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.feed-link {
  color: var(--bk-primary);
  cursor: pointer;
  margin-right: 6px;
  font-size: 13px;
}

.feed-link:hover {
  text-decoration: underline;
}

.text-muted {
  color: var(--bk-muted-fg);
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

