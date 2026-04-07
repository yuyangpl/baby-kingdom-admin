<template>
  <div class="dashboard">
    <h1 class="page-title">{{ $t('dashboard.title') }}</h1>

    <!-- Section 1: Real-time Status -->
    <div class="grid grid--5" style="margin-top: 20px">
      <template v-if="loadingRealtime">
        <div v-for="i in 5" :key="'skel-rt-' + i" class="dash-card">
          <div class="skeleton" style="width: 60%; height: 14px; margin-bottom: 12px" />
          <div class="skeleton" style="width: 40%; height: 24px" />
        </div>
      </template>
      <template v-else>
        <div v-for="q in queues" :key="q.name" class="dash-card">
          <span class="dash-card__label">{{ q.name }}</span>
          <div class="dash-card__row">
            <el-tag
              :type="q.status === 'running' ? 'success' : q.status === 'paused' ? 'warning' : 'info'"
              size="small"
            >
              {{ q.status }}
            </el-tag>
            <span
              class="status-dot"
              :class="{
                'status-dot--running': q.status === 'running',
                'status-dot--paused': q.status === 'paused',
                'status-dot--idle': q.status === 'idle',
                'status-dot--pulse': q.status === 'running',
              }"
            />
          </div>
        </div>
        <div class="dash-card card--warning">
          <span class="dash-card__label">{{ $t('dashboard.pendingFeeds') }}</span>
          <span class="dash-card__pending-value">{{ pendingFeeds }}</span>
        </div>
      </template>
    </div>

    <!-- Section 2: Today's Statistics -->
    <h2 class="section-title">{{ $t('dashboard.todayStats') }}</h2>
    <div class="grid grid--5">
      <template v-if="loadingToday">
        <div v-for="i in 5" :key="'skel-ts-' + i" class="dash-card">
          <div class="skeleton" style="width: 50%; height: 12px; margin-bottom: 12px" />
          <div class="skeleton" style="width: 60%; height: 28px" />
        </div>
      </template>
      <template v-else>
        <div v-for="stat in todayStats" :key="stat.label" class="dash-card">
          <span class="dash-card__label">{{ stat.label }}</span>
          <span class="dash-card__value">{{ stat.value }}</span>
          <span v-if="stat.sub" class="dash-card__sub">{{ stat.sub }}</span>
        </div>
      </template>
    </div>

    <!-- Section 3: Recent Activity + 7-Day Trends -->
    <div class="grid grid--3-2" style="margin-top: 24px">
      <!-- Recent Activity (2/3) -->
      <el-card class="dash-section-card" shadow="never">
        <template #header>{{ $t('dashboard.recentActivity') }}</template>
        <template v-if="loadingRecent">
          <div v-for="i in 5" :key="'skel-ra-' + i" style="display: flex; gap: 12px; margin-bottom: 16px">
            <div class="skeleton" style="width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px" />
            <div style="flex: 1">
              <div class="skeleton" style="width: 80%; height: 14px; margin-bottom: 6px" />
              <div class="skeleton" style="width: 40%; height: 12px" />
            </div>
          </div>
        </template>
        <div v-else-if="recentFeeds.length === 0" class="dash-empty">{{ $t('common.noData') }}</div>
        <el-timeline v-else>
          <el-timeline-item
            v-for="item in recentFeeds"
            :key="item._id"
            :timestamp="new Date(item.updatedAt).toLocaleString()"
            placement="top"
            :color="getTimelineColor(item.status)"
          >
            {{ item.feedId }} - {{ item.status }} - {{ item.threadSubject?.substring(0, 40) }}
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <!-- 7-Day Trends (1/3) -->
      <el-card class="dash-section-card" shadow="never">
        <template #header>{{ $t('dashboard.weeklyTrend') }}</template>
        <template v-if="loadingWeekly">
          <div v-for="i in 5" :key="'skel-wk-' + i" style="margin-bottom: 16px">
            <div class="skeleton" style="width: 50%; height: 14px; margin-bottom: 8px" />
            <div class="skeleton" style="width: 100%; height: 16px; border-radius: 8px" />
          </div>
        </template>
        <div v-else-if="weeklyStats.length === 0" class="dash-empty">{{ $t('common.noData') }}</div>
        <div v-else class="weekly-bars">
          <div v-for="day in weeklyStats" :key="day.date" class="weekly-bar-row">
            <span class="weekly-bar-row__label">{{ day.date }}</span>
            <el-progress
              :percentage="getWeeklyPercentage(day)"
              :stroke-width="14"
              :show-text="false"
              color="var(--bk-primary)"
            />
            <span class="weekly-bar-row__count">{{ day.feeds?.posted || 0 }}</span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Section 4: Quality & Cost + System Health -->
    <div class="grid grid--3-2" style="margin-top: 24px">
      <!-- Quality & Cost (3/5) -->
      <el-card class="dash-section-card" shadow="never">
        <template #header>{{ $t('common.qualityCost') }}</template>
        <div class="quality-grid">
          <div class="quality-card">
            <span class="quality-card__label">{{ $t('common.approvalRate') }}</span>
            <span class="quality-card__value">{{ qualityData.approvalRate }}</span>
          </div>
          <div class="quality-card">
            <span class="quality-card__label">{{ $t('common.avgReviewTime') }}</span>
            <span class="quality-card__value">{{ qualityData.avgReviewTime }}</span>
          </div>
          <div class="quality-card">
            <span class="quality-card__label">{{ $t('common.apiCost') }}</span>
            <span class="quality-card__value">{{ qualityData.apiCost }}</span>
          </div>
          <div class="quality-card">
            <span class="quality-card__label">{{ $t('common.personaPerformance') }}</span>
            <span class="quality-card__value">{{ qualityData.personaPerformance }}</span>
          </div>
        </div>
      </el-card>

      <!-- System Health (2/5) -->
      <el-card class="dash-section-card" shadow="never">
        <template #header>{{ $t('dashboard.systemHealth') }}</template>
        <template v-if="loadingHealth">
          <div v-for="i in 4" :key="'skel-sh-' + i" style="display: flex; gap: 12px; margin-bottom: 14px">
            <div class="skeleton" style="width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px" />
            <div style="flex: 1">
              <div class="skeleton" style="width: 60%; height: 14px; margin-bottom: 4px" />
              <div class="skeleton" style="width: 40%; height: 12px" />
            </div>
          </div>
        </template>
        <div v-else class="health-list">
          <div v-for="svc in serviceList" :key="svc.name" class="health-row">
            <span
              class="status-dot"
              :class="healthDotClass(svc.status)"
            />
            <div class="health-row__info">
              <span class="health-row__name">{{ svc.name }}</span>
              <span class="health-row__status">{{ healthStatusText(svc.status) }}</span>
              <span v-if="svc.detail" class="health-row__detail">{{ svc.detail }}</span>
              <span v-if="svc.checkedAt" class="health-row__time">{{ formatTimeAgo(svc.checkedAt) }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '../../api';

const { t } = useI18n();

interface QueueStatus {
  name: string;
  status: string;
}

interface TodayStat {
  label: string;
  value: string | number;
  sub?: string;
}

interface RecentFeed {
  _id: string;
  feedId: string;
  status: string;
  threadSubject?: string;
  updatedAt: string;
}

interface WeeklyDay {
  date: string;
  feeds?: { posted?: number; generated?: number };
}

interface ServiceHealth {
  name: string;
  status: string;
  detail?: string;
  checkedAt?: string;
}

const queues = ref<QueueStatus[]>([]);
const pendingFeeds = ref<number>(0);
const todayStats = ref<TodayStat[]>([]);
const recentFeeds = ref<RecentFeed[]>([]);
const weeklyStats = ref<WeeklyDay[]>([]);
const services = ref<any>({});

const SERVICE_LABELS: Record<string, string> = {
  bkForum: 'BK Forum API',
  mediaLens: 'MediaLens',
  gemini: 'Gemini API',
  googleTrends: 'Google Trends API',
};

const serviceList = computed(() => {
  const raw = services.value;
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw).map(([key, val]: [string, any]) => ({
    name: SERVICE_LABELS[key] || key,
    status: val?.status || 'unknown',
    detail: val?.detail || null,
    checkedAt: val?.checkedAt || null,
  }));
});

function healthDotClass(status: string): string {
  if (['connected', 'valid', 'operational'].includes(status)) return 'status-dot--success';
  if (['disconnected', 'expired'].includes(status)) return 'status-dot--error';
  if (['expiring_soon', 'no_recent_activity'].includes(status)) return 'status-dot--warning';
  return 'status-dot--idle';
}

function healthStatusText(status: string): string {
  const key = `dashboard.serviceStatus.${status}`;
  const translated = t(key);
  return translated !== key ? translated : status;
}

function formatTimeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

const loadingRealtime = ref(true);
const loadingToday = ref(true);
const loadingRecent = ref(true);
const loadingWeekly = ref(true);
const loadingHealth = ref(true);

const qualityData = ref({
  approvalRate: '-',
  avgReviewTime: '-',
  apiCost: '-',
  personaPerformance: '-',
});

const maxWeeklyPosted = computed(() => {
  const vals = weeklyStats.value.map((d) => d.feeds?.posted || 0);
  return Math.max(...vals, 1);
});

function getWeeklyPercentage(day: WeeklyDay): number {
  const posted = day.feeds?.posted || 0;
  return Math.round((posted / maxWeeklyPosted.value) * 100);
}

function getTimelineColor(status: string): string {
  if (status === 'posted') return 'var(--bk-success)';
  if (status === 'failed') return 'var(--bk-danger)';
  return 'var(--bk-info)';
}

onMounted(async () => {
  // Fetch realtime
  api.get('/v1/dashboard/realtime').then((res) => {
    queues.value = res.data?.queues || [];
    pendingFeeds.value = res.data?.pendingFeeds || 0;
  }).catch(() => {}).finally(() => { loadingRealtime.value = false; });

  // Fetch today's stats
  api.get('/v1/dashboard/today').then((res) => {
    const d = res.data || {};
    const approvalRate = Math.round((d.quality?.approvalRate || 0) * 100);
    todayStats.value = [
      { label: t('common.scanned'), value: d.scanner?.scanned || 0 },
      { label: t('common.hitRate'), value: `${Math.round((d.scanner?.hitRate || 0) * 100)}%` },
      { label: t('common.drafts'), value: d.feeds?.generated || 0 },
      { label: t('common.posted'), value: `${d.feeds?.posted || 0}/${d.feeds?.approved || 0}` },
      { label: t('common.newTrends'), value: d.trends?.pulled || 0 },
    ];
    qualityData.value = {
      approvalRate: `${approvalRate}%`,
      avgReviewTime: d.quality?.avgReviewTime || '-',
      apiCost: d.quality?.apiCost || '-',
      personaPerformance: d.quality?.personaPerformance || '-',
    };
  }).catch(() => {}).finally(() => { loadingToday.value = false; });

  // Fetch recent
  api.get('/v1/dashboard/recent').then((res) => {
    recentFeeds.value = res.data?.feeds || [];
  }).catch(() => {}).finally(() => { loadingRecent.value = false; });

  // Fetch weekly
  api.get('/v1/dashboard/weekly').then((res) => {
    weeklyStats.value = res.data || [];
  }).catch(() => {}).finally(() => { loadingWeekly.value = false; });

  // Fetch health (returns { bkForum, mediaLens, gemini, googleTrends })
  api.get('/health/services').then((res: any) => {
    services.value = res.data || res || {};
  }).catch(() => {
    services.value = {} as any;
  }).finally(() => { loadingHealth.value = false; });
});
</script>

<style scoped>
/* ---- Grid layouts ---- */
.grid {
  display: grid;
  gap: 16px;
}

.grid--5 {
  grid-template-columns: repeat(5, 1fr);
}

.grid--3-2 {
  grid-template-columns: 3fr 2fr;
}

@media (max-width: 1024px) {
  .grid--5 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid--3-2 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .grid--5 {
    grid-template-columns: 1fr;
  }
}

/* ---- Section title ---- */
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--bk-foreground);
  margin: 24px 0 12px;
}

/* ---- Dashboard metric card ---- */
.dash-card {
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dash-card__label {
  font-size: 12px;
  color: var(--bk-muted-fg);
  text-transform: capitalize;
}

.dash-card__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dash-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--bk-foreground);
}

.dash-card__sub {
  font-size: 11px;
  color: #94A3B8;
}

.dash-card__pending-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--bk-warning);
}

/* ---- Section card ---- */
.dash-section-card {
  min-height: 200px;
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
}

.dash-empty {
  color: var(--bk-muted-fg);
  font-size: 14px;
  text-align: center;
  padding: 24px 0;
}

/* ---- Weekly bars ---- */
.weekly-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weekly-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.weekly-bar-row__label {
  font-size: 12px;
  color: var(--bk-muted-fg);
  min-width: 70px;
  flex-shrink: 0;
}

.weekly-bar-row :deep(.el-progress) {
  flex: 1;
}

.weekly-bar-row__count {
  font-size: 13px;
  font-weight: 600;
  color: var(--bk-foreground);
  min-width: 24px;
  text-align: right;
}

/* ---- Quality grid ---- */
.quality-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.quality-card {
  background: var(--bk-muted);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quality-card__label {
  font-size: 12px;
  color: var(--bk-muted-fg);
}

.quality-card__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--bk-foreground);
}

/* ---- Health list ---- */
.health-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.health-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.health-row .status-dot {
  margin-top: 5px;
  flex-shrink: 0;
}

.health-row__info {
  display: flex;
  flex-direction: column;
}

.health-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--bk-foreground);
}

.health-row__status {
  font-size: 13px;
  color: var(--bk-foreground);
}
.health-row__detail {
  font-size: 12px;
  color: var(--bk-muted-fg);
}
.health-row__time {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
</style>
