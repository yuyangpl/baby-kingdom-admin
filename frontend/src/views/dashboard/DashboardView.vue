<template>
  <div>
    <h2>{{ $t('dashboard.title') }}</h2>

    <!-- Section A: Real-time Status -->
    <el-row :gutter="16" style="margin-bottom: 20px">
      <el-col :span="4" v-for="q in queues" :key="q.name">
        <el-card shadow="hover">
          <div class="queue-card">
            <span class="queue-name">{{ q.name }}</span>
            <el-tag :type="q.status === 'running' ? 'success' : 'warning'" size="small">{{ q.status }}</el-tag>
          </div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="hover">
          <div class="queue-card">
            <span class="pending-count">{{ pendingFeeds }}</span>
            <span class="pending-label">{{ $t('dashboard.pendingFeeds') }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Section B: Today's Stats -->
    <el-row :gutter="16" style="margin-bottom: 20px">
      <el-col :span="4" v-for="stat in todayStats" :key="stat.label">
        <el-statistic :title="stat.label" :value="stat.value" />
      </el-col>
    </el-row>

    <!-- Section C: Recent Activity -->
    <el-row :gutter="16">
      <el-col :span="14">
        <el-card>
          <template #header>{{ $t('dashboard.recentActivity') }}</template>
          <el-timeline>
            <el-timeline-item v-for="item in recentFeeds" :key="item._id"
              :timestamp="new Date(item.updatedAt).toLocaleString()" placement="top"
              :color="item.status === 'posted' ? '#67C23A' : item.status === 'failed' ? '#F56C6C' : '#409EFF'">
              {{ item.feedId }} - {{ item.status }} - {{ item.threadSubject?.substring(0, 30) }}
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>{{ $t('dashboard.weeklyTrend') }}</template>
          <p v-for="day in weeklyStats" :key="day.date">
            {{ day.date }}: {{ day.feeds?.posted || 0 }} posted
          </p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api';

const queues = ref<any[]>([]);
const pendingFeeds = ref<number>(0);
const todayStats = ref<any[]>([]);
const recentFeeds = ref<any[]>([]);
const weeklyStats = ref<any[]>([]);

onMounted(async () => {
  try {
    const [realtime, today, recent, weekly] = await Promise.all([
      api.get('/v1/dashboard/realtime'),
      api.get('/v1/dashboard/today'),
      api.get('/v1/dashboard/recent'),
      api.get('/v1/dashboard/weekly'),
    ]);

    queues.value = realtime.data?.queues || [];
    pendingFeeds.value = realtime.data?.pendingFeeds || 0;

    const t = today.data || {};
    todayStats.value = [
      { label: 'Generated', value: t.feeds?.generated || 0 },
      { label: 'Approved', value: t.feeds?.approved || 0 },
      { label: 'Posted', value: t.feeds?.posted || 0 },
      { label: 'Rejected', value: t.feeds?.rejected || 0 },
      { label: 'Trends', value: t.trends?.pulled || 0 },
      { label: 'Approval Rate', value: `${Math.round((t.quality?.approvalRate || 0) * 100)}%` },
    ];

    recentFeeds.value = recent.data?.feeds || [];
    weeklyStats.value = weekly.data || [];
  } catch { /* ignore on initial load */ }
});
</script>

<style scoped>
.queue-card { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.queue-name { font-size: 12px; color: #909399; text-transform: capitalize; }
.pending-count { font-size: 32px; font-weight: bold; color: #E6A23C; }
.pending-label { font-size: 12px; color: #909399; }
</style>
