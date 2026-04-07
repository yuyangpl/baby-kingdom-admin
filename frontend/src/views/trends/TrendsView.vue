<template>
  <div class="trends-view">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
      <h1 class="page-title" style="margin: 0;">{{ $t('trends.title') }}</h1>
      <el-button type="primary" :loading="pulling" @click="triggerPull">
        {{ $t('trends.triggerPull') }}
      </el-button>
    </div>

    <!-- Token Status Card -->
    <el-card
      class="token-card"
      :class="tokenValid ? 'card--success' : 'card--danger'"
      shadow="never"
    >
      <div class="token-status">
        <el-icon :size="20" :color="tokenValid ? 'var(--bk-success)' : 'var(--bk-danger)'">
          <CircleCheckFilled v-if="tokenValid" />
          <WarningFilled v-else />
        </el-icon>
        <span>{{ tokenValid ? `MediaLens Token Valid until ${tokenExpiry}` : 'MediaLens Token Expired or Missing' }}</span>
      </div>
    </el-card>

    <!-- Data Source Toggles -->
    <el-card class="source-card" shadow="never">
      <template #header>
        <span class="card-header-title">Data Sources</span>
      </template>
      <div class="source-toggles">
        <div class="source-toggle-item">
          <span>MediaLens</span>
          <el-switch v-model="sources.mediaLens" />
        </div>
        <div class="source-toggle-item">
          <span>LIHKG</span>
          <el-switch v-model="sources.lihkg" />
        </div>
        <div class="source-toggle-item">
          <span>Facebook</span>
          <el-switch v-model="sources.facebook" />
        </div>
      </div>
    </el-card>

    <!-- Trends Table -->
    <el-card shadow="never" class="table-card">
      <el-table
        :data="trends"
        v-loading="loading"
        style="width: 100%"
        :row-class-name="sentimentRowClass"
        highlight-current-row
      >
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
        <el-table-column prop="source" :label="$t('trends.source')" width="120">
          <template #default="{ row }">
            <el-tag
              :type="sourceTagType(row.source)"
              size="small"
              effect="light"
            >
              {{ row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rank" :label="$t('trends.rank')" width="70" align="center" />
        <el-table-column prop="topicLabel" :label="$t('trends.topicLabel')" min-width="180" show-overflow-tooltip />
        <el-table-column prop="sentimentScore" :label="$t('trends.sentiment')" width="120">
          <template #default="{ row }">
            <el-tag
              :type="sentimentTagType(row.sentimentScore)"
              size="small"
            >
              {{ sentimentLabel(row.sentimentScore) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sensitivityTier" :label="$t('trends.tier')" width="80" align="center">
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
        <el-table-column prop="toneMode" :label="$t('trends.toneMode')" width="110" />
        <el-table-column prop="isUsed" :label="$t('trends.used')" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isUsed ? 'success' : 'info'" size="small">
              {{ row.isUsed ? '是' : '否' }}
            </el-tag>
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
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import api from '../../api'

const { t } = useI18n()

const trends = ref<any[]>([])
const loading = ref(false)
const pulling = ref(false)
const tokenValid = ref(true)
const tokenExpiry = ref('')

const sources = reactive({
  mediaLens: true,
  lihkg: true,
  facebook: false,
})

const sourceTagType = (source: string): string => {
  const map: Record<string, string> = {
    medialens: 'primary',
    MediaLens: 'primary',
    lihkg: 'warning',
    LIHKG: 'warning',
    facebook: 'info',
    Facebook: 'info',
  }
  return map[source] ?? 'info'
}

const sentimentTagType = (score: number | undefined): string => {
  if (score == null) return 'info'
  if (score >= 60) return 'success'
  if (score <= 40) return 'danger'
  return 'info'
}

const sentimentLabel = (score: number | undefined): string => {
  if (score == null) return 'neutral'
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

const sentimentRowClass = ({ row }: { row: any }): string => {
  if (row.sentimentScore > 0) return 'row-positive'
  if (row.sentimentScore < 0) return 'row-negative'
  return ''
}

const loadTrends = async () => {
  loading.value = true
  try {
    const res = await api.get('/v1/trends')
    const payload = res.data ?? res
    trends.value = Array.isArray(payload) ? payload : (payload.data ?? [])
  } finally {
    loading.value = false
  }
}

const loadTokenStatus = async () => {
  try {
    const res = await api.get('/v1/trends/token-status')
    const data = res.data ?? res
    tokenValid.value = data.valid ?? true
    if (data.expiry) {
      tokenExpiry.value = new Date(data.expiry).toLocaleString()
    }
  } catch {
    // endpoint may not exist yet
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

onMounted(() => {
  loadTrends()
  loadTokenStatus()
})
</script>

<style scoped>
.trends-view {
}

.token-card {
  margin-bottom: 16px;
  border-radius: var(--bk-radius);
}

.token-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.source-card {
  margin-bottom: 20px;
  border-radius: var(--bk-radius);
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.source-toggles {
  display: flex;
  gap: 32px;
}

.source-toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
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
</style>

<style>
/* Row sentiment background - unscoped to reach el-table internals */
.trends-view .el-table .row-positive td {
  background-color: #F0FDF4 !important;
}
.trends-view .el-table .row-negative td {
  background-color: #FEF2F2 !important;
}
</style>
