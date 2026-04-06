<template>
  <div class="feed-view">
    <h2>Feed Queue</h2>

    <el-table :data="feeds" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="feedId" label="Feed ID" width="120" />
      <el-table-column prop="status" label="Status" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="Source" width="100" />
      <el-table-column prop="threadSubject" label="Thread Subject" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.threadSubject?.substring(0, 60) }}{{ row.threadSubject?.length > 60 ? '...' : '' }}
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
      <el-table-column label="Actions" width="180" fixed="right">
        <template #default="{ row }">
          <el-button type="success" size="small" @click="approve(row)">Approve</el-button>
          <el-button type="danger" size="small" @click="reject(row)">Reject</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'

const feeds = ref([])
const loading = ref(false)

const statusType = (status) => {
  const map = { pending: 'warning', approved: 'success', rejected: 'danger', posted: 'info' }
  return map[status] || ''
}

const loadFeeds = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/feeds?status=pending')
    feeds.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const approve = async (row) => {
  await api.patch(`/v1/feeds/${row.feedId}/approve`)
  ElMessage.success('Feed approved')
  loadFeeds()
}

const reject = async (row) => {
  await api.patch(`/v1/feeds/${row.feedId}/reject`)
  ElMessage.success('Feed rejected')
  loadFeeds()
}

onMounted(loadFeeds)
</script>

<style scoped>
.feed-view {
  padding: 20px;
}
</style>
