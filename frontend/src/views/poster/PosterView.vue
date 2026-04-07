<template>
  <div class="poster-view">
    <h2>{{ $t('poster.history') }}</h2>

    <el-table :data="history" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="feedId" label="Feed ID" width="120" />
      <el-table-column prop="bkUsername" label="BK Username" width="150" />
      <el-table-column prop="status" :label="$t('common.status')" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'posted' ? 'success' : row.status === 'failed' ? 'danger' : 'info'" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="postedAt" :label="$t('poster.posted')" width="170">
        <template #default="{ row }">
          {{ row.postedAt ? new Date(row.postedAt).toLocaleString() : '-' }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../api'

const history = ref<any[]>([])
const loading = ref<boolean>(false)

const loadHistory = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/poster/history')
    history.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

onMounted(loadHistory)
</script>

<style scoped>
.poster-view {
  padding: 20px;
}
</style>
