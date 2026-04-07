<template>
  <div class="queue-view">
    <h2>{{ $t('queue.title') }}</h2>

    <el-row :gutter="16" v-loading="loading">
      <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="q in queues" :key="q.name" style="margin-bottom: 16px">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>{{ q.name }}</span>
              <el-tag :type="q.status === 'running' ? 'success' : q.status === 'paused' ? 'warning' : 'danger'" size="small">
                {{ q.status }}
              </el-tag>
            </div>
          </template>
          <p><strong>{{ $t('queue.waiting') }}:</strong> {{ q.waiting ?? 0 }}</p>
          <p><strong>{{ $t('queue.active') }}:</strong> {{ q.active ?? 0 }}</p>
          <p><strong>{{ $t('queue.completed') }}:</strong> {{ q.completed ?? 0 }}</p>
          <p><strong>{{ $t('queue.failed') }}:</strong> {{ q.failed ?? 0 }}</p>
          <div style="margin-top: 12px">
            <el-button v-if="q.status === 'running'" type="warning" size="small" @click="pauseQueue(q)">{{ $t('queue.pause') }}</el-button>
            <el-button v-else type="success" size="small" @click="resumeQueue(q)">{{ $t('queue.resume') }}</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const queues = ref<any[]>([])
const loading = ref<boolean>(false)

const loadQueues = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/queues')
    queues.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const pauseQueue = async (q: any) => {
  await api.post(`/v1/queues/${q.name}/pause`)
  ElMessage.success(`${q.name} ${t('queue.pause').toLowerCase()}d`)
  loadQueues()
}

const resumeQueue = async (q: any) => {
  await api.post(`/v1/queues/${q.name}/resume`)
  ElMessage.success(`${q.name} ${t('queue.resume').toLowerCase()}d`)
  loadQueues()
}

onMounted(loadQueues)
</script>

<style scoped>
.queue-view {
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
