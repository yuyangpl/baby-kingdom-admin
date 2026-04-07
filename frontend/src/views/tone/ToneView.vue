<template>
  <div class="tone-view">
    <div class="page-header">
      <h1 class="page-title">{{ $t('tone.title') }}</h1>
      <el-button type="primary" @click="openAdd">
        {{ $t('tone.addTone') }}
      </el-button>
    </div>

    <el-card shadow="never" class="table-card">
      <el-table
        :data="tones"
        v-loading="loading"
        style="width: 100%"
        :header-cell-style="{ background: 'var(--bk-muted)', color: 'var(--bk-foreground)' }"
        highlight-current-row
        row-key="toneId"
      >
        <!-- Expand row -->
        <el-table-column type="expand" width="40">
          <template #default="{ row }">
            <div class="expanded-detail">
              <div class="detail-grid">
                <div class="detail-item" v-if="row.openingStyle">
                  <span class="detail-label">Opening Style</span>
                  <span class="detail-value">{{ row.openingStyle }}</span>
                </div>
                <div class="detail-item" v-if="row.sentenceStructure">
                  <span class="detail-label">Sentence Structure</span>
                  <span class="detail-value">{{ row.sentenceStructure }}</span>
                </div>
                <div class="detail-item" v-if="row.whatToAvoid">
                  <span class="detail-label">What to Avoid</span>
                  <span class="detail-value">{{ row.whatToAvoid }}</span>
                </div>
                <div class="detail-item" v-if="row.exampleOpening">
                  <span class="detail-label">Example Opening</span>
                  <span class="detail-value detail-value--italic">{{ row.exampleOpening }}</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="toneId" :label="$t('tone.toneId')" width="120">
          <template #default="{ row }">
            <code class="mono">{{ row.toneId }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="displayName" :label="$t('tone.displayName')" min-width="160" />
        <el-table-column prop="whenToUse" label="When to Use" min-width="200" show-overflow-tooltip />
        <el-table-column prop="emotionalRegister" label="Emotional Register" min-width="160" show-overflow-tooltip />
        <el-table-column prop="suitableForTier3" :label="$t('tone.tier3Suitable')" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.suitableForTier3 ? 'success' : 'info'" size="small">
              {{ row.suitableForTier3 ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="overridePriority" :label="$t('tone.priority')" width="90" align="center" />
        <el-table-column prop="isActive" :label="$t('common.status')" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.isActive" size="small" @change="toggleActive(row)" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">{{ $t('common.edit') }}</el-button>
            <el-popconfirm
              title="Are you sure you want to delete this tone?"
              :confirm-button-text="$t('common.delete')"
              :cancel-button-text="$t('common.cancel')"
              @confirm="handleDelete(row)"
            >
              <template #reference>
                <el-button type="danger" size="small" plain>{{ $t('common.delete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <ToneForm
      v-model="showForm"
      :edit-data="editData"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'
import ToneForm from './ToneForm.vue'

const tones = ref<any[]>([])
const loading = ref(false)
const showForm = ref(false)
const editData = ref<Record<string, any> | null>(null)

const loadTones = async () => {
  loading.value = true
  try {
    const res = await api.get('/v1/tones')
    tones.value = res.data ?? res ?? []
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  editData.value = null
  showForm.value = true
}

const openEdit = (row: any) => {
  editData.value = { ...row }
  showForm.value = true
}

const handleDelete = async (row: any) => {
  try {
    await api.delete(`/v1/tones/${row.toneId}`)
    ElMessage.success('Tone deleted')
    loadTones()
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to delete tone')
  }
}

const toggleActive = async (row: any) => {
  try {
    await api.patch(`/v1/tones/${row.toneId}`, { isActive: row.isActive })
    ElMessage.success('Tone updated')
  } catch {
    row.isActive = !row.isActive
  }
}

const onSaved = () => {
  loadTones()
}

onMounted(loadTones)
</script>

<style scoped>
.tone-view {
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.table-card {
  border-radius: var(--bk-radius);
}

.mono {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--bk-muted-fg);
}

.expanded-detail {
  background: var(--bk-muted);
  padding: 16px 24px;
  border-radius: var(--bk-radius-sm);
  margin: 4px 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: var(--bk-muted-fg);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  font-size: 14px;
  color: var(--bk-foreground);
}

.detail-value--italic {
  font-style: italic;
}
</style>
