<template>
  <div class="audit-view">
    <div class="audit-view__header">
      <h2 class="page-title">{{ $t('audit.title') }}</h2>
      <el-button plain @click="exportCSV">
        Export CSV
      </el-button>
    </div>

    <!-- Filters -->
    <el-card shadow="never" class="audit-filters">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-select
            v-model="filters.module"
            placeholder="Module"
            clearable
            style="width: 100%"
            @change="loadAudits"
          >
            <el-option v-for="m in moduleOptions" :key="m" :label="m" :value="m" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-select
            v-model="filters.eventType"
            placeholder="Event Type"
            clearable
            style="width: 100%"
            @change="loadAudits"
          >
            <el-option v-for="e in eventTypeOptions" :key="e" :label="e" :value="e" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-select
            v-model="filters.operator"
            placeholder="Operator"
            clearable
            style="width: 100%"
            @change="loadAudits"
          >
            <el-option v-for="o in operatorOptions" :key="o" :label="o" :value="o" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-input
            v-model="filters.targetId"
            placeholder="Target ID"
            clearable
            @clear="loadAudits"
            @keyup.enter="loadAudits"
          />
        </el-col>
      </el-row>
    </el-card>

    <!-- Audit log table -->
    <el-table
      :data="audits"
      v-loading="loading"
      stripe
      border
      style="width: 100%; margin-top: 16px"
      row-key="_id"
      :expand-row-keys="expandedRows"
      @expand-change="handleExpand"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="audit-expand">
            <div class="audit-expand__detail">
              <strong>Full Detail:</strong>
              <p>{{ row.actionDetail || '--' }}</p>
            </div>
            <div v-if="row.before" class="audit-expand__diff audit-expand__diff--before">
              <strong>Before:</strong>
              <pre>{{ JSON.stringify(row.before, null, 2) }}</pre>
            </div>
            <div v-if="row.after" class="audit-expand__diff audit-expand__diff--after">
              <strong>After:</strong>
              <pre>{{ JSON.stringify(row.after, null, 2) }}</pre>
            </div>
            <div v-if="row.ip" class="audit-expand__ip">
              <strong>IP Address:</strong> {{ row.ip }}
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" :label="$t('common.createdAt')" width="170">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </el-table-column>

      <el-table-column prop="eventType" :label="$t('audit.eventType')" width="140">
        <template #default="{ row }">
          <el-tag size="small">{{ row.eventType }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="module" :label="$t('audit.module')" width="130">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="moduleTagType(row.module)"
            effect="dark"
          >
            {{ row.module }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="operator" :label="$t('audit.operator')" width="140">
        <template #default="{ row }">
          <span v-if="row.operator === 'System' || row.operator === 'system'" class="operator-system">
            <el-tag size="small" type="info" effect="plain">System</el-tag>
          </span>
          <span v-else class="operator-user">
            <el-icon style="margin-right: 4px"><User /></el-icon>
            {{ row.operator }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="targetId" label="Target ID" width="140">
        <template #default="{ row }">
          <code v-if="row.targetId" class="mono-id">{{ row.targetId }}</code>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="actionDetail" :label="$t('audit.detail')" min-width="200" show-overflow-tooltip />

      <el-table-column prop="sessionId" label="Session" width="120">
        <template #default="{ row }">
          <el-tag
            v-if="row.sessionId"
            size="small"
            effect="plain"
          >
            {{ row.sessionId.slice(0, 8) }}
          </el-tag>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { User } from '@element-plus/icons-vue'
import api from '../../api'

const audits = ref<any[]>([])
const loading = ref<boolean>(false)
const expandedRows = ref<string[]>([])

const filters = reactive({
  module: '',
  eventType: '',
  operator: '',
  targetId: '',
})

const moduleOptions = ['Feed', 'Persona', 'Scanner', 'Config', 'Trends', 'Queue', 'Tone', 'TopicRule', 'Forum', 'Auth']
const eventTypeOptions = ['create', 'update', 'delete', 'login', 'logout', 'approve', 'reject', 'scan', 'generate', 'post']
const operatorOptions = ref<string[]>([])

const moduleTagType = (mod: string): string => {
  const map: Record<string, string> = {
    Feed: '',
    Persona: 'warning',
    Scanner: 'success',
    Config: 'warning',
    Trends: 'danger',
    Queue: 'info',
  }
  return map[mod] ?? ''
}

const handleExpand = (row: any, expanded: any[]) => {
  expandedRows.value = expanded.map((r: any) => r._id)
}

const loadAudits = async () => {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filters.module) params.module = filters.module
    if (filters.eventType) params.eventType = filters.eventType
    if (filters.operator) params.operator = filters.operator
    if (filters.targetId) params.targetId = filters.targetId

    const { data } = await api.get('/v1/audits', { params })
    audits.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const exportCSV = () => {
  const headers = ['Timestamp', 'Event Type', 'Module', 'Operator', 'Target ID', 'Detail']
  const rows = audits.value.map(a => [
    new Date(a.createdAt).toISOString(),
    a.eventType,
    a.module,
    a.operator,
    a.targetId || '',
    (a.actionDetail || '').replace(/"/g, '""'),
  ])
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(loadAudits)
</script>

<style scoped>
.audit-view {
}
.audit-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.audit-filters {
  margin-bottom: 0;
}
.audit-filters :deep(.el-card__body) {
  padding: 16px;
}

/* Module color tags — handled via Element Plus tag types */

.operator-system {
  display: inline-flex;
  align-items: center;
}
.operator-user {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
}
.mono-id {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--bk-foreground);
  background: var(--bk-muted);
  padding: 2px 6px;
  border-radius: var(--bk-radius-sm);
}
.text-muted {
  color: var(--bk-muted-fg);
  font-size: 13px;
}

/* Expanded row */
.audit-expand {
  padding: 16px 24px;
  background: #F9FAFB;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.audit-expand__detail p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.audit-expand__diff {
  padding: 12px;
  border-radius: var(--bk-radius-sm);
  font-size: 13px;
}
.audit-expand__diff pre {
  margin: 8px 0 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.audit-expand__diff--before {
  background: #FEF2F2;
  border: 1px solid #FECACA;
}
.audit-expand__diff--after {
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
}
.audit-expand__ip {
  font-size: 13px;
  color: var(--bk-muted-fg);
}
</style>
