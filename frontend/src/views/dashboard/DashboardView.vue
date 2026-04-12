<template>
  <div class="dashboard">
    <h1 class="page-title">{{ $t('dashboard.title') }}</h1>

    <!-- Section 1: Real-time Status -->
    <div class="grid grid--1 section-gap-sm">
      <template v-if="loadingRealtime">
        <div v-for="i in 1" :key="'skel-rt-' + i" class="dash-card">
          <div class="skeleton skel--label" />
          <div class="skeleton skel--value" />
        </div>
      </template>
      <template v-else>
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
          <div class="skeleton skel--label" />
          <div class="skeleton skel--value" />
        </div>
      </template>
      <template v-else>
        <div v-for="stat in todayStats" :key="stat.label" class="dash-card dash-card--stat">
          <div class="dash-card__body">
            <span class="dash-card__label">{{ stat.label }}</span>
            <span class="dash-card__value">{{ stat.value }}</span>
            <span v-if="stat.sub" class="dash-card__sub">{{ stat.sub }}</span>
          </div>
          <el-icon v-if="stat.icon" class="dash-card__icon">
            <component :is="stat.icon" />
          </el-icon>
        </div>
      </template>
    </div>

    <!-- Section 3: System Health + 7-Day Trends -->
    <div class="grid grid--3-2 grid--stretch section-gap">
      <!-- System Health (2/3) -->
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
        <div v-else class="health-grid">
          <div v-for="svc in serviceList" :key="svc.name" class="health-card" :class="'health-card--' + healthCardType(svc.status)">
            <div class="health-card__header">
              <el-icon class="health-card__icon" :class="'health-card__icon--' + healthCardType(svc.status)">
                <CircleCheckFilled v-if="healthCardType(svc.status) === 'ok'" />
                <WarningFilled v-else-if="healthCardType(svc.status) === 'warn'" />
                <CircleCloseFilled v-else-if="healthCardType(svc.status) === 'error'" />
                <InfoFilled v-else />
              </el-icon>
              <span class="health-card__name">{{ svc.name }}</span>
            </div>
            <div class="health-card__status">{{ healthStatusText(svc.status) }}</div>
            <div v-if="svc.detail" class="health-card__detail">{{ svc.detail }}</div>
          </div>
        </div>
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
        <div v-else-if="weeklyStats.length === 0" class="dash-empty">
          <el-icon class="dash-empty__icon"><TrendCharts /></el-icon>
          <span>{{ $t('common.noData') }}</span>
        </div>
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

    <!-- Section 4: Recent Activity + Quality & Cost -->
    <div class="grid grid--3-2 section-gap">
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
        <div v-else-if="recentFeeds.length === 0" class="dash-empty">
          <el-icon class="dash-empty__icon"><Document /></el-icon>
          <span>{{ $t('common.noData') }}</span>
        </div>
        <el-timeline v-else>
          <el-timeline-item
            v-for="item in recentFeeds"
            :key="item.id || item._id"
            :timestamp="new Date(item.updatedAt).toLocaleString()"
            placement="top"
            :color="getTimelineColor(item.status)"
          >
            {{ item.feedId }} - {{ item.status }} - {{ item.threadSubject?.substring(0, 40) }}
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <!-- Quality & Cost (1/3) -->
      <el-card class="dash-section-card dash-section-card--auto" shadow="never">
        <template #header>{{ $t('common.qualityCost') }}</template>
        <div class="quality-grid">
          <div class="quality-card">
            <div class="quality-card__body">
              <span class="quality-card__label">{{ $t('common.approvalRate') }}</span>
              <span class="quality-card__value">{{ qualityData.approvalRate }}</span>
            </div>
            <el-icon class="quality-card__icon"><CircleCheck /></el-icon>
          </div>
          <div class="quality-card">
            <div class="quality-card__body">
              <span class="quality-card__label">{{ $t('common.avgReviewTime') }}</span>
              <span class="quality-card__value">{{ qualityData.avgReviewTime }}</span>
            </div>
            <el-icon class="quality-card__icon"><Timer /></el-icon>
          </div>
          <div class="quality-card">
            <div class="quality-card__body">
              <span class="quality-card__label">{{ $t('common.apiCost') }}</span>
              <span class="quality-card__value">{{ qualityData.apiCost }}</span>
            </div>
            <el-icon class="quality-card__icon"><Coin /></el-icon>
          </div>
          <div class="quality-card">
            <div class="quality-card__body">
              <span class="quality-card__label">{{ $t('common.personaPerformance') }}</span>
              <span class="quality-card__value">{{ qualityData.personaPerformance }}</span>
            </div>
            <el-icon class="quality-card__icon"><User /></el-icon>
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

interface TodayStat {
  label: string;
  value: string | number;
  sub?: string;
  icon?: string;
}

interface RecentFeed {
  id: string;
  _id?: string;
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

function healthCardType(status: string): string {
  if (['connected', 'valid', 'operational'].includes(status)) return 'ok';
  if (['disconnected', 'expired'].includes(status)) return 'error';
  if (['expiring_soon', 'no_recent_activity'].includes(status)) return 'warn';
  return 'neutral';
}

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
    pendingFeeds.value = res.data?.pendingFeeds || 0;
  }).catch(() => {}).finally(() => { loadingRealtime.value = false; });

  // Fetch today's stats
  api.get('/v1/dashboard/today').then((res) => {
    const d = res.data || {};
    const approvalRate = Math.round((d.quality?.approvalRate || 0) * 100);
    todayStats.value = [
      { label: t('common.scanned'), value: d.scanner?.totalScanned || 0, icon: 'Search' },
      { label: t('common.hitRate'), value: `${Math.round((d.scanner?.hitRate || 0) * 100)}%`, icon: 'Aim' },
      { label: t('common.drafts'), value: d.feeds?.generated || 0, icon: 'Document' },
      { label: t('common.posted'), value: `${d.feeds?.posted || 0}/${d.feeds?.approved || 0}`, icon: 'Promotion' },
      { label: t('common.newTrends'), value: d.trends?.pulled || 0, icon: 'TrendCharts' },
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
/* ---- Spacing ---- */
.section-gap-sm { margin-top: 16px; }
.section-gap { margin-top: 24px; }

/* ---- Skeleton ---- */
.skel--label { width: 55%; height: 14px; margin-bottom: 12px; }
.skel--value { width: 45%; height: 24px; }

/* ---- Grid layouts ---- */
.grid {
  display: grid;
  gap: 16px;
}

.grid--1 {
  grid-template-columns: 1fr;
  max-width: 320px;
}

.grid--5 {
  grid-template-columns: repeat(5, 1fr);
}

.grid--3-2 {
  grid-template-columns: 3fr 2fr;
}
.grid--stretch {
  align-items: stretch;
}
.grid--stretch > .dash-section-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.grid--stretch > .dash-section-card :deep(.el-card__body) {
  flex: 1;
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

.dash-card--stat {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.dash-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dash-card__icon {
  font-size: 28px;
  color: var(--el-color-primary-light-5);
  flex-shrink: 0;
}
.dash-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--bk-foreground);
  font-variant-numeric: tabular-nums;
}

.dash-card__sub {
  font-size: 11px;
  color: var(--bk-muted-fg);
}

.dash-card__pending-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--bk-warning);
  font-variant-numeric: tabular-nums;
}

/* ---- Section card ---- */
.dash-section-card {
  min-height: 200px;
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
}
.dash-section-card--auto {
  min-height: auto;
  height: fit-content;
  align-self: start;
}

.dash-empty {
  color: var(--bk-muted-fg);
  font-size: 14px;
  text-align: center;
  padding: 32px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.dash-empty__icon {
  font-size: 32px;
  color: var(--el-text-color-placeholder);
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
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.quality-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.quality-card__icon {
  font-size: 22px;
  color: var(--el-color-primary-light-5);
  flex-shrink: 0;
}

.quality-card__label {
  font-size: 12px;
  color: var(--bk-muted-fg);
}

.quality-card__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--bk-foreground);
  font-variant-numeric: tabular-nums;
}

/* ---- Health list ---- */
.health-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.health-card {
  border-radius: var(--bk-radius-sm);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--bk-border);
  background: var(--bk-muted);
}
.health-card--ok {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}
.health-card--error {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}
.health-card--warn {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}
.health-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.health-card__icon {
  font-size: 16px;
  flex-shrink: 0;
}
.health-card__icon--ok { color: var(--el-color-success); }
.health-card__icon--error { color: var(--el-color-danger); }
.health-card__icon--warn { color: var(--el-color-warning); }
.health-card__icon--neutral { color: var(--el-text-color-secondary); }
.health-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--bk-foreground);
}
.health-card__status {
  font-size: 13px;
  font-weight: 500;
  color: var(--bk-foreground);
}
.health-card__detail {
  font-size: 12px;
  color: var(--bk-muted-fg);
}
</style>
