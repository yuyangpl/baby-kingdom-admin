<template>
  <div class="forum-view">
    <h2>{{ $t('forum.title') }}</h2>

    <el-tree
      v-loading="loading"
      :data="treeData"
      :props="{ label: 'name', children: 'boards' }"
      default-expand-all
      node-key="fid"
    >
      <template #default="{ node, data }">
        <div class="tree-node">
          <span>{{ data.name }}</span>
          <template v-if="data.fid">
            <el-tag size="small" type="info" style="margin-left: 8px">fid: {{ data.fid }}</el-tag>
            <el-switch
              v-model="data.enableScraping"
              style="margin-left: 12px"
              :active-text="$t('forum.enableScraping')"
              @change="toggleScraping(data)"
            />
          </template>
        </div>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const treeData = ref<any[]>([])
const loading = ref<boolean>(false)

const loadForums = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/forums')
    treeData.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

const toggleScraping = async (board: any) => {
  try {
    await api.patch(`/v1/forums/${board.fid}`, { enableScraping: board.enableScraping })
    ElMessage.success(t('common.success'))
  } catch {
    board.enableScraping = !board.enableScraping
  }
}

onMounted(loadForums)
</script>

<style scoped>
.forum-view {
  padding: 20px;
}
.tree-node {
  display: flex;
  align-items: center;
}
</style>
