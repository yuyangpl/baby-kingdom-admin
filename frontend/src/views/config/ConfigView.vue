<template>
  <div class="config-view">
    <h2>System Config</h2>

    <el-tabs v-model="activeTab" v-loading="loading">
      <el-tab-pane v-for="cat in categories" :key="cat" :label="cat" :name="cat">
        <div
          v-for="item in configsByCategory(cat)"
          :key="item.key"
          class="config-row"
        >
          <div class="config-header">
            <span class="config-key">{{ item.key }}</span>
            <span v-if="item.description" class="config-desc">{{ item.description }}</span>
          </div>
          <div class="config-value-row">
            <el-input
              v-if="item.isSecret && !item._showSecret"
              v-model="item._editValue"
              type="password"
              show-password
              placeholder="********  (enter new value to change)"
              style="flex: 1"
            />
            <el-input
              v-else-if="isLongText(item.key, item.value)"
              v-model="item._editValue"
              type="textarea"
              :rows="4"
              style="flex: 1"
            />
            <el-input
              v-else
              v-model="item._editValue"
              style="flex: 1"
            />
            <el-button
              type="primary"
              :loading="item._saving"
              @click="saveConfig(item)"
              style="margin-left: 8px"
            >
              Save
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'

const configs = ref<any[]>([])
const loading = ref<boolean>(false)
const activeTab = ref<string>('')

const LONG_TEXT_KEYS = [
  'GEMINI_SYSTEM_PROMPT',
  'GEMINI_REPLY_PROMPT',
  'GEMINI_NEW_POST_PROMPT',
  'SCANNER_SYSTEM_PROMPT',
]

const categories = computed(() => {
  const cats = [...new Set(configs.value.map((c) => c.category || 'general'))]
  return cats.sort()
})

const configsByCategory = (cat: string) => {
  return configs.value.filter((c) => (c.category || 'general') === cat)
}

const isLongText = (key: string, value: any): boolean => {
  if (LONG_TEXT_KEYS.some((k) => key.toUpperCase().includes(k))) return true
  if (typeof value === 'string' && value.length > 100) return true
  return false
}

const loadConfigs = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/configs')
    const list = data ?? []
    configs.value = list.map((c: any) => ({
      ...c,
      _editValue: c.isSecret ? '' : (c.value ?? ''),
      _saving: false,
      _showSecret: false,
    }))
    if (categories.value.length && !activeTab.value) {
      activeTab.value = categories.value[0]
    }
  } finally {
    loading.value = false
  }
}

const saveConfig = async (item: any) => {
  // For secret fields, skip if empty (no change intended)
  if (item.isSecret && !item._editValue) {
    ElMessage.warning('Enter a new value to update this secret config')
    return
  }
  item._saving = true
  try {
    await api.put(`/v1/configs/${item.key}`, { value: item._editValue })
    ElMessage.success(`Config "${item.key}" saved`)
    // Update local value for non-secret fields
    if (!item.isSecret) {
      item.value = item._editValue
    } else {
      item._editValue = ''
    }
  } catch (err: any) {
    ElMessage.error(err.message || `Failed to save config "${item.key}"`)
  } finally {
    item._saving = false
  }
}

onMounted(loadConfigs)
</script>

<style scoped>
.config-view {
  padding: 20px;
}
.config-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.config-row:last-child {
  border-bottom: none;
}
.config-header {
  margin-bottom: 6px;
}
.config-key {
  font-weight: 700;
  font-size: 14px;
  margin-right: 12px;
}
.config-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.config-value-row {
  display: flex;
  align-items: flex-start;
}
</style>
