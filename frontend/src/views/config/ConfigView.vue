<template>
  <div class="config-view">
    <h2>System Config</h2>

    <el-tabs v-model="activeTab" v-loading="loading">
      <el-tab-pane v-for="cat in categories" :key="cat" :label="cat" :name="cat">
        <el-table :data="configsByCategory(cat)" stripe border style="width: 100%">
          <el-table-column prop="key" label="Key" width="250" />
          <el-table-column prop="value" label="Value" min-width="200">
            <template #default="{ row }">
              <span v-if="row.isSecret">********</span>
              <span v-else>{{ row.value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="Description" min-width="250" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../../api'

const configs = ref([])
const loading = ref(false)
const activeTab = ref('')

const categories = computed(() => {
  const cats = [...new Set(configs.value.map((c) => c.category || 'general'))]
  return cats.sort()
})

const configsByCategory = (cat) => {
  return configs.value.filter((c) => (c.category || 'general') === cat)
}

const loadConfigs = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/configs')
    configs.value = data.data ?? data
    if (categories.value.length) {
      activeTab.value = categories.value[0]
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadConfigs)
</script>

<style scoped>
.config-view {
  padding: 20px;
}
</style>
