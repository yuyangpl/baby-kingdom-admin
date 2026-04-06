<template>
  <div class="feed-view">
    <h2>Feed Queue</h2>

    <!-- New feeds banner -->
    <el-alert
      v-if="feedStore.newFeedCount > 0"
      :title="`${feedStore.newFeedCount} new feed(s) available`"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    >
      <el-button type="primary" size="small" link @click="refreshNewFeeds">
        Load new feeds
      </el-button>
    </el-alert>

    <!-- Toolbar -->
    <div class="toolbar">
      <el-button type="primary" @click="showCustomGenerate = true">
        Custom Generate
      </el-button>
      <el-button
        type="success"
        :disabled="!selectedRows.length"
        @click="batchApprove"
      >
        Batch Approve ({{ selectedRows.length }})
      </el-button>
      <el-button
        type="danger"
        :disabled="!selectedRows.length"
        @click="batchReject"
      >
        Batch Reject ({{ selectedRows.length }})
      </el-button>
    </div>

    <!-- Status Tabs -->
    <el-tabs v-model="activeTab" @tab-change="onTabChange" style="margin-bottom: 8px">
      <el-tab-pane name="pending">
        <template #label>
          Pending
          <el-badge
            v-if="pendingCount > 0"
            :value="pendingCount"
            :max="99"
            class="tab-badge"
          />
        </template>
      </el-tab-pane>
      <el-tab-pane label="Approved" name="approved" />
      <el-tab-pane label="Posted" name="posted" />
      <el-tab-pane label="Rejected" name="rejected" />
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
      <el-table-column prop="status" label="Status" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="Source" width="120">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="threadSubject" label="Thread Subject" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ truncate(row.threadSubject, 40) }}
        </template>
      </el-table-column>
      <el-table-column prop="personaId" label="Persona" width="120" />
      <el-table-column prop="toneMode" label="Tone" width="100" />
      <el-table-column prop="charCount" label="Chars" width="80" />
      <el-table-column prop="createdAt" label="Created" width="170">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="280" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="!row.claimedBy"
            type="warning"
            size="small"
            link
            @click="claim(row)"
          >
            Claim
          </el-button>
          <el-button
            v-else
            type="info"
            size="small"
            link
            @click="unclaim(row)"
          >
            Unclaim
          </el-button>
          <el-button type="primary" size="small" link @click="openEdit(row)">Edit</el-button>
          <el-button
            v-if="row.status !== 'approved'"
            type="success"
            size="small"
            link
            @click="approve(row)"
          >
            Approve
          </el-button>
          <el-button
            v-if="row.status !== 'rejected'"
            type="danger"
            size="small"
            link
            @click="rejectWithNotes(row)"
          >
            Reject
          </el-button>
          <el-button type="warning" size="small" link @click="regenerate(row)">Regen</el-button>
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

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../../api'
import { useFeedStore } from '../../stores/feed'
import FeedEditModal from './FeedEditModal.vue'
import CustomGenerateModal from './CustomGenerateModal.vue'

const feedStore = useFeedStore()

const activeTab = ref('pending')
const selectedRows = ref([])
const tableRef = ref(null)
const showEditModal = ref(false)
const editRow = ref(null)
const showCustomGenerate = ref(false)
const pendingCount = ref(0)

const statusType = (status) => {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger', posted: 'info' }
  return map[status] || ''
}

const truncate = (str, len) => {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

const loadFeeds = async () => {
  await feedStore.fetchFeeds()
}

const loadPendingCount = async () => {
  try {
    const res = await api.get('/v1/feeds', { params: { status: 'pending', limit: 1 } })
    pendingCount.value = res.pagination?.total ?? 0
  } catch {
    // ignore
  }
}

const onTabChange = (tab) => {
  feedStore.setFilter('status', tab)
  loadFeeds()
}

const toggleSourceFilter = (src) => {
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

const onSelectionChange = (rows) => {
  selectedRows.value = rows
}

const onPageChange = (page) => {
  feedStore.setPage(page)
  loadFeeds()
}

const refreshNewFeeds = () => {
  feedStore.clearNewCount()
  loadFeeds()
}

const openEdit = (row) => {
  editRow.value = { ...row }
  showEditModal.value = true
}

const onFeedSaved = () => {
  loadFeeds()
  loadPendingCount()
}

const claim = async (row) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/claim`)
    ElMessage.success('Feed claimed')
    loadFeeds()
  } catch (err) {
    ElMessage.error(err.message || 'Failed to claim feed')
  }
}

const unclaim = async (row) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/unclaim`)
    ElMessage.success('Feed unclaimed')
    loadFeeds()
  } catch (err) {
    ElMessage.error(err.message || 'Failed to unclaim feed')
  }
}

const approve = async (row) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/approve`)
    ElMessage.success('Feed approved')
    loadFeeds()
    loadPendingCount()
  } catch (err) {
    ElMessage.error(err.message || 'Failed to approve feed')
  }
}

const rejectWithNotes = async (row) => {
  try {
    const { value: notes } = await ElMessageBox.prompt(
      'Enter rejection notes (optional):',
      'Reject Feed',
      {
        confirmButtonText: 'Reject',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
        inputPlaceholder: 'Reason for rejection...',
      }
    )
    await api.post(`/v1/feeds/${row.feedId}/reject`, { notes: notes || '' })
    ElMessage.success('Feed rejected')
    loadFeeds()
    loadPendingCount()
  } catch (err) {
    // User cancelled the prompt
    if (err === 'cancel') return
    ElMessage.error(err.message || 'Failed to reject feed')
  }
}

const regenerate = async (row) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/regenerate`)
    ElMessage.success('Regeneration started')
    loadFeeds()
  } catch (err) {
    ElMessage.error(err.message || 'Failed to regenerate')
  }
}

const batchApprove = async () => {
  const ids = selectedRows.value.map((r) => r.feedId)
  if (!ids.length) return
  try {
    await api.post('/v1/feeds/batch-approve', { feedIds: ids })
    ElMessage.success(`${ids.length} feed(s) approved`)
    tableRef.value?.clearSelection()
    loadFeeds()
    loadPendingCount()
  } catch (err) {
    ElMessage.error(err.message || 'Batch approve failed')
  }
}

const batchReject = async () => {
  const ids = selectedRows.value.map((r) => r.feedId)
  if (!ids.length) return
  try {
    const { value: notes } = await ElMessageBox.prompt(
      'Enter rejection notes for all selected feeds (optional):',
      'Batch Reject',
      {
        confirmButtonText: 'Reject All',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
        inputPlaceholder: 'Reason for rejection...',
      }
    )
    await api.post('/v1/feeds/batch-reject', { feedIds: ids, notes: notes || '' })
    ElMessage.success(`${ids.length} feed(s) rejected`)
    tableRef.value?.clearSelection()
    loadFeeds()
    loadPendingCount()
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error(err.message || 'Batch reject failed')
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
