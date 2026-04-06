<template>
  <div class="topic-rules-view">
    <h2>Topic Rules</h2>

    <el-button type="primary" @click="showAdd = true" style="margin-bottom: 16px">
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
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'

const rules = ref([])
const loading = ref(false)
const showAdd = ref(false)

const loadRules = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/topic-rules')
    rules.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

onMounted(loadRules)
</script>

<style scoped>
.topic-rules-view {
  padding: 20px;
}
</style>
