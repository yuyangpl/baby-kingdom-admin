<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api, { type ApiResponse } from '../../api';

interface GoogleTrendNews {
  headline: string;
  url: string;
}

interface GoogleTrendAnalysis {
  summary: string;
  parentingRelevance: 'high' | 'medium' | 'low' | 'none';
  suggestedAngle: string;
  safeToMention: boolean;
}

interface GoogleTrend {
  _id: string;
  query: string;
  score: number;
  peakVolume: number;
  durationHours: number;
  categories: string[];
  trendBreakdown: string[];
  news: GoogleTrendNews[];
  analysis: GoogleTrendAnalysis | null;
  pullId: string;
  pulledAt: string;
  geo: string;
}

const trends = ref<GoogleTrend[]>([]);
const loading = ref(false);
const triggering = ref(false);
const pagination = ref({ page: 1, limit: 20, total: 0, pages: 0 });
const filters = ref({ relevance: '', safeOnly: '' });

async function loadTrends() {
  loading.value = true;
  try {
    const params: Record<string, any> = {
      page: pagination.value.page,
      limit: pagination.value.limit,
    };
    if (filters.value.relevance) params.relevance = filters.value.relevance;
    if (filters.value.safeOnly) params.safeOnly = filters.value.safeOnly;
    const res = await api.get('/v1/google-trends', { params }) as unknown as ApiResponse<GoogleTrend[]>;
    trends.value = res.data || [];
    pagination.value = res.pagination || pagination.value;
  } catch (err: any) {
    ElMessage.error('Failed to load trends');
  } finally {
    loading.value = false;
  }
}

async function triggerPull() {
  try {
    await ElMessageBox.confirm('Trigger a new Google Trends pull now?', 'Confirm', { type: 'info' });
    triggering.value = true;
    const res = await api.post('/v1/google-trends/trigger') as unknown as ApiResponse<{ count: number; pullId: string }>;
    ElMessage.success(`Pulled ${res.data?.count || 0} trends (${res.data?.pullId})`);
    await loadTrends();
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('Pull failed');
  } finally {
    triggering.value = false;
  }
}

function relevanceColor(rel: string | undefined): string {
  const map: Record<string, string> = { high: 'success', medium: '', low: 'info', none: 'danger' };
  return map[rel || 'none'] || 'info';
}

function formatVolume(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(v);
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-HK');
}

function handlePageChange(page: number) {
  pagination.value.page = page;
  loadTrends();
}

function handleFilterChange() {
  pagination.value.page = 1;
  loadTrends();
}

onMounted(() => loadTrends());
</script>

<template>
  <div class="google-trends-page">
    <!-- Top bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <span v-if="trends.length" style="color: #909399; font-size: 13px;">
          Last pull: {{ formatTime(trends[0]?.pulledAt) }}
        </span>
        <span v-else style="color: #909399; font-size: 13px;">No data yet</span>
        <el-tag size="small" style="margin-left: 8px;">Auto-pull every 30 min</el-tag>
      </div>
      <el-button type="primary" :loading="triggering" @click="triggerPull">
        Trigger Pull Now
      </el-button>
    </div>

    <!-- Filters -->
    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
      <el-select v-model="filters.relevance" placeholder="Relevance" clearable @change="handleFilterChange" style="width: 160px;">
        <el-option label="All" value="" />
        <el-option label="High" value="high" />
        <el-option label="Medium" value="medium" />
        <el-option label="Low" value="low" />
        <el-option label="None" value="none" />
      </el-select>
      <el-select v-model="filters.safeOnly" placeholder="Safe to Mention" clearable @change="handleFilterChange" style="width: 160px;">
        <el-option label="All" value="" />
        <el-option label="Safe Only" value="true" />
      </el-select>
    </div>

    <!-- Table -->
    <el-table :data="trends" v-loading="loading" stripe row-key="_id">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div style="padding: 12px 20px;">
            <div v-if="row.analysis" style="margin-bottom: 12px;">
              <strong>Gemini Analysis:</strong> {{ row.analysis.summary }}<br/>
              <strong>Suggested Angle:</strong> {{ row.analysis.suggestedAngle || '-' }}
            </div>
            <div v-if="row.categories?.length" style="margin-bottom: 8px;">
              <strong>Categories:</strong>
              <el-tag v-for="c in row.categories" :key="c" size="small" style="margin: 2px;">{{ c }}</el-tag>
            </div>
            <div v-if="row.trendBreakdown?.length" style="margin-bottom: 8px;">
              <strong>Related:</strong>
              <el-tag v-for="t in row.trendBreakdown" :key="t" size="small" type="info" style="margin: 2px;">{{ t }}</el-tag>
            </div>
            <div v-if="row.news?.length">
              <strong>News ({{ row.news.length }}):</strong>
              <ul style="margin: 4px 0; padding-left: 20px;">
                <li v-for="(n, i) in row.news" :key="i">
                  <a v-if="n.url" :href="n.url" target="_blank">{{ n.headline }}</a>
                  <span v-else>{{ n.headline }}</span>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="#" width="50" type="index" />
      <el-table-column label="Query" prop="query" min-width="180" />
      <el-table-column label="Score" prop="score" width="80" sortable />
      <el-table-column label="Peak Volume" width="110">
        <template #default="{ row }">{{ formatVolume(row.peakVolume) }}</template>
      </el-table-column>
      <el-table-column label="Duration" width="90">
        <template #default="{ row }">{{ row.durationHours }}h</template>
      </el-table-column>
      <el-table-column label="News" width="70">
        <template #default="{ row }">
          <el-badge :value="row.news?.length || 0" type="info" />
        </template>
      </el-table-column>
      <el-table-column label="Relevance" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.analysis" :type="relevanceColor(row.analysis.parentingRelevance)" size="small">
            {{ row.analysis.parentingRelevance }}
          </el-tag>
          <span v-else style="color: #c0c4cc;">-</span>
        </template>
      </el-table-column>
      <el-table-column label="Safe" width="60" align="center">
        <template #default="{ row }">
          <el-icon v-if="row.analysis?.safeToMention" color="#67c23a"><CircleCheck /></el-icon>
          <el-icon v-else-if="row.analysis" color="#f56c6c"><CircleClose /></el-icon>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="Pulled At" width="160">
        <template #default="{ row }">{{ formatTime(row.pulledAt) }}</template>
      </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div style="margin-top: 16px; display: flex; justify-content: center;">
      <el-pagination
        :current-page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.google-trends-page {
  padding: 0;
}
</style>
