<template>
  <div class="feed-view">
    <h2>{{ $t('feed.title') }}</h2>

    <!-- New feeds banner -->
    <el-alert
      v-if="feedStore.newFeedCount > 0"
      :title="`${feedStore.newFeedCount} ${$t('feed.newFeeds')}`"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    >
      <el-button type="primary" size="small" link @click="refreshNewFeeds">
        {{ $t('feed.loadNew') }}
      </el-button>
    </el-alert>

    <!-- Toolbar -->
    <div class="toolbar">
      <el-button type="primary" @click="showCustomGenerate = true">
        {{ $t('feed.customGenerate') }}
      </el-button>
      <el-button
        type="success"
        :disabled="!selectedRows.length"
        @click="batchApprove"
      >
        {{ $t('feed.batchApprove') }} ({{ selectedRows.length }})
      </el-button>
      <el-button
        type="danger"
        :disabled="!selectedRows.length"
        @click="batchReject"
      >
        {{ $t('feed.batchReject') }} ({{ selectedRows.length }})
      </el-button>
    </div>

    <!-- Status Tabs -->
    <el-tabs v-model="activeTab" @tab-change="onTabChange" style="margin-bottom: 8px">
      <el-tab-pane name="pending">
        <template #label>
          {{ $t('feed.tabs.pending') }}
          <el-badge
            v-if="pendingCount > 0"
            :value="pendingCount"
            :max="99"
            class="tab-badge"
          />
        </template>
      </el-tab-pane>
      <el-tab-pane :label="$t('feed.tabs.approved')" name="approved" />
      <el-tab-pane :label="$t('feed.tabs.posted')" name="posted" />
      <el-tab-pane :label="$t('feed.tabs.rejected')" name="rejected" />
    </el-tabs>

    <!-- Quick filter chips -->
    <div class="filter-chips">
      <el-tag
        v-for="src in ['bk-forum', 'google-trends', 'medialens', 'custom']"
        :key="src"
        :type="feedStore.filters.source === src ? '' : 'info'"
        :effect="feedStore.filters.source === src ? 'dark' : 'plain'"
        class="filter-chip"
        @click="toggleSourceFilter(src)"
      >
        {{ src }}
      </el-tag>
      <el-tag
        v-if="feedStore.filters.source"
        type="info"
        effect="plain"
        class="filter-chip"
        @click="clearSourceFilter"
      >
        Clear filter
      </el-tag>
    </div>

    <!-- Feed table -->
    <el-table
      ref="tableRef"
      :data="feedStore.feeds"
      v-loading="feedStore.loading"
      stripe
      border
      style="width: 100%"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="45" />
      <el-table-column prop="feedId" label="Feed ID" width="120" />
      <el-table-column prop="status" :label="$t('common.status')" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" :label="$t('trends.source')" width="120">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="threadSubject" :label="$t('feed.threadSubject')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ truncate(row.threadSubject, 40) }}
        </template>
      </el-table-column>
      <el-table-column prop="personaId" :label="$t('feed.persona')" width="120" />
      <el-table-column prop="toneMode" :label="$t('feed.toneMode')" width="100" />
      <el-table-column prop="charCount" label="Chars" width="80" />
      <el-table-column prop="createdAt" :label="$t('common.createdAt')" width="170">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="280" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="!row.claimedBy"
            type="warning"
            size="small"
            link
            @click="claim(row)"
          >
            {{ $t('feed.claim') }}
          </el-button>
          <el-button
            v-else
            type="info"
            size="small"
            link
            @click="unclaim(row)"
          >
            {{ $t('feed.unclaim') }}
          </el-button>
          <el-button type="primary" size="small" link @click="openEdit(row)">{{ $t('common.edit') }}</el-button>
          <el-button
            v-if="row.status !== 'approved'"
            type="success"
            size="small"
            link
            @click="approve(row)"
          >
            {{ $t('feed.approve') }}
          </el-button>
          <el-button
            v-if="row.status !== 'rejected'"
            type="danger"
            size="small"
            link
            @click="rejectWithNotes(row)"
          >
            {{ $t('feed.reject') }}
          </el-button>
          <el-button type="warning" size="small" link @click="regenerate(row)">{{ $t('feed.regenerate') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Pagination -->
    <el-pagination
      v-if="feedStore.pagination.pages > 1"
      style="margin-top: 16px; justify-content: center"
      layout="prev, pager, next"
      :total="feedStore.pagination.total"
      :page-size="feedStore.pagination.limit"
      :current-page="feedStore.pagination.page"
      @current-change="onPageChange"
    />

    <!-- Modals -->
    <FeedEditModal
      v-model="showEditModal"
      :edit-data="editRow"
      @saved="onFeedSaved"
    />

    <CustomGenerateModal
      v-model="showCustomGenerate"
      @saved="onFeedSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TableInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'
import { useFeedStore } from '../../stores/feed'
import FeedEditModal from './FeedEditModal.vue'
import CustomGenerateModal from './CustomGenerateModal.vue'

const { t } = useI18n()
const feedStore = useFeedStore()

const activeTab = ref<string>('pending')
const selectedRows = ref<any[]>([])
const tableRef = ref<TableInstance>()
const showEditModal = ref<boolean>(false)
const editRow = ref<Record<string, any> | null>(null)
const showCustomGenerate = ref<boolean>(false)
const pendingCount = ref<number>(0)

const statusType = (status: string): string => {
  const map: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', posted: 'info' }
  return map[status] || ''
}

const truncate = (str: string | undefined, len: number): string => {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

const loadFeeds = async () => {
  await feedStore.fetchFeeds()
}

const loadPendingCount = async () => {
  try {
    const res = await api.get('/v1/feeds', { params: { status: 'pending', limit: 1 } })
    pendingCount.value = (res as any).pagination?.total ?? 0
  } catch {
    // ignore
  }
}

const onTabChange = (tab: string) => {
  feedStore.setFilter('status', tab)
  loadFeeds()
}

const toggleSourceFilter = (src: string) => {
  if (feedStore.filters.source === src) {
    feedStore.setFilter('source', '')
  } else {
    feedStore.setFilter('source', src)
  }
  loadFeeds()
}

const clearSourceFilter = () => {
  feedStore.setFilter('source', '')
  loadFeeds()
}

const onSelectionChange = (rows: any[]) => {
  selectedRows.value = rows
}

const onPageChange = (page: number) => {
  feedStore.setPage(page)
  loadFeeds()
}

const refreshNewFeeds = () => {
  feedStore.clearNewCount()
  loadFeeds()
}

const openEdit = (row: any) => {
  editRow.value = { ...row }
  showEditModal.value = true
}

const onFeedSaved = () => {
  loadFeeds()
  loadPendingCount()
}

const claim = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/claim`)
    ElMessage.success(t('feed.claim'))
    loadFeeds()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const unclaim = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/unclaim`)
    ElMessage.success(t('feed.unclaim'))
    loadFeeds()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const approve = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/approve`)
    ElMessage.success(t('feed.approve'))
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const rejectWithNotes = async (row: any) => {
  try {
    const { value: notes } = await ElMessageBox.prompt(
      t('feed.placeholder.notes'),
      t('feed.reject'),
      {
        confirmButtonText: t('feed.reject'),
        cancelButtonText: t('common.cancel'),
        inputType: 'textarea',
        inputPlaceholder: t('feed.placeholder.notes'),
      }
    )
    await api.post(`/v1/feeds/${row.feedId}/reject`, { notes: notes || '' })
    ElMessage.success(t('feed.reject'))
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    // User cancelled the prompt
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const regenerate = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/regenerate`)
    ElMessage.success(t('feed.regenerate'))
    loadFeeds()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const batchApprove = async () => {
  const ids = selectedRows.value.map((r) => r.feedId)
  if (!ids.length) return
  try {
    await api.post('/v1/feeds/batch-approve', { feedIds: ids })
    ElMessage.success(`${ids.length} ${t('feed.approve')}`)
    tableRef.value?.clearSelection()
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const batchReject = async () => {
  const ids = selectedRows.value.map((r) => r.feedId)
  if (!ids.length) return
  try {
    const { value: notes } = await ElMessageBox.prompt(
      t('feed.placeholder.notes'),
      t('feed.batchReject'),
      {
        confirmButtonText: t('feed.reject'),
        cancelButtonText: t('common.cancel'),
        inputType: 'textarea',
        inputPlaceholder: t('feed.placeholder.notes'),
      }
    )
    await api.post('/v1/feeds/batch-reject', { feedIds: ids, notes: notes || '' })
    ElMessage.success(`${ids.length} ${t('feed.reject')}`)
    tableRef.value?.clearSelection()
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

onMounted(() => {
  feedStore.setFilter('status', 'pending')
  loadFeeds()
  loadPendingCount()
})
</script>

<style scoped>
.feed-view {
  padding: 20px;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.filter-chips {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-chip {
  cursor: pointer;
}
.tab-badge {
  margin-left: 6px;
}
</style>
