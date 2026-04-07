<template>
  <div class="topic-rules-view">
    <div class="topic-rules-view__header">
      <h2 class="page-title">{{ $t('topicRules.title') }}</h2>
      <el-button type="primary" @click="openAdd">
        {{ $t('topicRules.addRule') }}
      </el-button>
    </div>

    <el-table :data="rules" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="ruleId" :label="$t('topicRules.ruleId')" width="120">
        <template #default="{ row }">
          <code class="mono-id">{{ row.ruleId }}</code>
        </template>
      </el-table-column>

      <el-table-column prop="topicKeywords" :label="$t('topicRules.keywords')" min-width="250">
        <template #default="{ row }">
          <template v-if="row.topicKeywords?.length">
            <el-tag
              v-for="kw in row.topicKeywords.slice(0, 3)"
              :key="kw"
              size="small"
              effect="plain"
              class="keyword-chip"
            >
              {{ kw }}
            </el-tag>
            <span
              v-if="row.topicKeywords.length > 3"
              class="keyword-overflow"
            >
              +{{ row.topicKeywords.length - 3 }}
            </span>
          </template>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="sensitivityTier" :label="$t('topicRules.sensitivityTier')" width="150">
        <template #default="{ row }">
          <span
            class="tier-badge"
            :class="`tier-badge--${row.sensitivityTier}`"
          >
            Tier {{ row.sensitivityTier }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="sentimentTrigger" :label="$t('topicRules.sentimentTrigger')" width="150">
        <template #default="{ row }">
          <el-tag
            v-if="row.sentimentTrigger"
            size="small"
            effect="plain"
          >
            {{ row.sentimentTrigger }}
          </el-tag>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="priorityAccounts" :label="$t('topicRules.priorityAccounts')" min-width="180">
        <template #default="{ row }">
          <template v-if="row.priorityAccounts?.length">
            <code
              v-for="acc in row.priorityAccounts"
              :key="acc"
              class="account-tag"
            >
              {{ acc }}
            </code>
          </template>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="assignToneMode" :label="$t('topicRules.assignToneMode')" width="140" />

      <el-table-column prop="postType" :label="$t('topicRules.postType')" width="120">
        <template #default="{ row }">
          <el-tag
            v-if="row.postType"
            size="small"
            type="info"
          >
            {{ row.postType }}
          </el-tag>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column :label="$t('common.actions')" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">
            {{ $t('common.edit') }}
          </el-button>
          <el-popconfirm
            title="Are you sure you want to delete this rule?"
            :confirm-button-text="$t('common.delete')"
            :cancel-button-text="$t('common.cancel')"
            @confirm="handleDelete(row)"
          >
            <template #reference>
              <el-button type="danger" size="small" plain>
                {{ $t('common.delete') }}
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <TopicRuleForm
      v-model="showForm"
      :edit-data="editData"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'
import TopicRuleForm from './TopicRuleForm.vue'

const { t } = useI18n()

const rules = ref<any[]>([])
const loading = ref<boolean>(false)
const showForm = ref<boolean>(false)
const editData = ref<Record<string, any> | null>(null)

const loadRules = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/topic-rules')
    rules.value = data ?? []
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
    await api.delete(`/v1/topic-rules/${row.ruleId}`)
    ElMessage.success(t('topicRules.ruleDeleted'))
    loadRules()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.deleteFailed'))
  }
}

const onSaved = () => {
  loadRules()
}

onMounted(loadRules)
</script>

<style scoped>
.topic-rules-view {
}
.topic-rules-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.mono-id {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  color: var(--bk-foreground);
  background: var(--bk-muted);
  padding: 2px 8px;
  border-radius: var(--bk-radius-sm);
}
.keyword-chip {
  margin: 2px 4px 2px 0;
}
.keyword-overflow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--bk-muted-fg);
  background: var(--bk-muted);
  border-radius: var(--bk-radius-sm);
}
.tier-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--bk-radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}
.tier-badge--1 { background-color: var(--bk-tier1); }
.tier-badge--2 { background-color: var(--bk-tier2); }
.tier-badge--3 { background-color: var(--bk-tier3); }
.account-tag {
  display: inline-block;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--bk-primary);
  background: var(--bk-primary-light);
  padding: 2px 8px;
  border-radius: var(--bk-radius-sm);
  margin: 2px 4px 2px 0;
}
.text-muted {
  color: var(--bk-muted-fg);
  font-size: 13px;
}
</style>
