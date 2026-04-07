<template>
  <div class="topic-rules-view">
    <h2>Topic Rules</h2>

    <el-button type="primary" @click="openAdd" style="margin-bottom: 16px">
      Add Rule
    </el-button>

    <el-table :data="rules" v-loading="loading" stripe border style="width: 100%">
      <el-table-column prop="ruleId" label="Rule ID" width="120" />
      <el-table-column prop="topicKeywords" label="Keywords" min-width="250">
        <template #default="{ row }">
          <el-tag v-for="kw in (row.topicKeywords || [])" :key="kw" size="small" style="margin: 2px">
            {{ kw }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sensitivityTier" label="Sensitivity Tier" width="140" />
      <el-table-column prop="assignToneMode" label="Assign Tone" width="150" />
      <el-table-column prop="isActive" label="Active" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
            {{ row.isActive ? 'Yes' : 'No' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" link @click="openEdit(row)">Edit</el-button>
          <el-popconfirm
            title="Are you sure you want to delete this rule?"
            confirm-button-text="Delete"
            cancel-button-text="Cancel"
            @confirm="handleDelete(row)"
          >
            <template #reference>
              <el-button type="danger" size="small" link>Delete</el-button>
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
import api from '../../api'
import TopicRuleForm from './TopicRuleForm.vue'

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
    ElMessage.success('Rule deleted')
    loadRules()
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to delete rule')
  }
}

const onSaved = () => {
  loadRules()
}

onMounted(loadRules)
</script>

<style scoped>
.topic-rules-view {
  padding: 20px;
}
</style>
