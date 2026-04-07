<template>
  <div class="forum-view">
    <h2 class="page-title" style="margin-bottom: 20px">{{ $t('forum.title') }}</h2>

    <div class="forum-layout">
      <!-- Left panel: Board tree -->
      <el-card class="forum-tree-panel" shadow="never">
        <template #header>
          <div class="tree-panel__header">
            <span class="tree-panel__title">{{ $t('forum.title') }}</span>
            <el-button
              size="small"
              :icon="Refresh"
              :loading="syncing"
              @click="syncFromBK"
            >
              {{ $t('forum.syncFromBk') }}
            </el-button>
          </div>
        </template>

        <div v-loading="loading" class="tree-panel__body">
          <div v-for="cat in treeData" :key="cat.name" class="tree-category">
            <div
              class="tree-category__header"
              @click="toggleCategory(cat)"
            >
              <el-icon class="tree-category__arrow" :class="{ 'is-expanded': cat._expanded !== false }">
                <ArrowRight />
              </el-icon>
              <span class="tree-category__name">{{ cat.name }}</span>
            </div>

            <div v-show="cat._expanded !== false" class="tree-category__boards">
              <div
                v-for="board in (cat.boards || [])"
                :key="board.fid"
                class="tree-board"
                :class="{ 'tree-board--selected': selectedBoard?.fid === board.fid }"
                @click="selectBoard(board)"
              >
                <span
                  class="status-dot"
                  :class="board.enableScraping ? 'status-dot--active' : 'status-dot--idle'"
                />
                <span class="tree-board__name">{{ board.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <!-- Right panel: Board detail form -->
      <el-card class="forum-detail-panel" shadow="never">
        <template v-if="selectedBoard">
          <el-form label-position="top" class="board-form">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item :label="$t('forum.boardName')">
                  <el-input :model-value="selectedBoard.name" disabled />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="$t('forum.fid')">
                  <el-input :model-value="String(selectedBoard.fid)" disabled />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item :label="$t('forum.enableScraping')">
                  <el-switch v-model="formData.enableScraping" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item>
                  <template #label>
                    <span>{{ $t('forum.enableAutoReply') }}</span>
                    <el-tooltip content="When enabled, approved replies will be automatically posted" placement="top">
                      <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </template>
                  <el-switch v-model="formData.enableAutoReply" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item :label="$t('forum.replyThresholdMin')">
                  <el-input-number v-model="formData.replyThresholdMin" :min="0" :max="formData.replyThresholdMax" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="$t('forum.replyThresholdMax')">
                  <el-input-number v-model="formData.replyThresholdMax" :min="formData.replyThresholdMin" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item :label="$t('forum.scanInterval')">
                  <el-input v-model="formData.scanInterval" placeholder="e.g. 30m, 1h" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="$t('forum.defaultTone')">
                  <el-select v-model="formData.defaultTone" :placeholder="$t('forum.selectTone')" style="width: 100%">
                    <el-option v-for="t in toneOptions" :key="t" :label="t" :value="t" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item :label="$t('forum.sensitivity')">
              <el-select v-model="formData.sensitivityTier" style="width: 100%">
                <el-option :value="1" :label="$t('forum.tierLow')" />
                <el-option :value="2" :label="$t('forum.tierMedium')" />
                <el-option :value="3" :label="$t('forum.tierHigh')" />
              </el-select>
            </el-form-item>

            <el-form-item :label="$t('forum.notes')">
              <el-input v-model="formData.notes" type="textarea" :rows="3" :placeholder="$t('forum.notesPlaceholder')" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" @click="saveBoard">
                Save
              </el-button>
            </el-form-item>
          </el-form>
        </template>

        <div v-else class="forum-detail-empty">
          <el-empty :description="$t('forum.selectBoard')" />
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, ArrowRight, QuestionFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const treeData = ref<any[]>([])
const loading = ref<boolean>(false)
const syncing = ref<boolean>(false)
const saving = ref<boolean>(false)
const selectedBoard = ref<any>(null)
const toneOptions = ref<string[]>([])

const formData = reactive({
  enableScraping: false,
  enableAutoReply: false,
  replyThresholdMin: 0,
  replyThresholdMax: 5,
  scanInterval: '',
  defaultTone: '',
  sensitivityTier: 1,
  notes: '',
})

const loadForums = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/forums')
    const raw = data.data ?? data
    treeData.value = Array.isArray(raw) ? raw.map((cat: any) => ({ ...cat, _expanded: true })) : []
  } finally {
    loading.value = false
  }
}

const loadTones = async () => {
  try {
    const { data } = await api.get('/v1/tones')
    const list = data.data ?? data ?? []
    toneOptions.value = list.map((t: any) => t.toneId || t.displayName)
  } catch {
    // ignore
  }
}

const toggleCategory = (cat: any) => {
  cat._expanded = cat._expanded === false ? true : false
}

const selectBoard = (board: any) => {
  selectedBoard.value = board
}

watch(selectedBoard, (board) => {
  if (board) {
    formData.enableScraping = board.enableScraping ?? false
    formData.enableAutoReply = board.enableAutoReply ?? false
    formData.replyThresholdMin = board.replyThresholdMin ?? 0
    formData.replyThresholdMax = board.replyThresholdMax ?? 5
    formData.scanInterval = board.scanInterval ?? ''
    formData.defaultTone = board.defaultTone ?? ''
    formData.sensitivityTier = board.sensitivityTier ?? 1
    formData.notes = board.notes ?? ''
  }
})

const saveBoard = async () => {
  if (!selectedBoard.value) return
  saving.value = true
  try {
    await api.patch(`/v1/forums/${selectedBoard.value.fid}`, { ...formData })
    Object.assign(selectedBoard.value, formData)
    ElMessage.success(t('common.success'))
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to save')
  } finally {
    saving.value = false
  }
}

const syncFromBK = async () => {
  syncing.value = true
  try {
    await api.post('/v1/forums/sync')
    ElMessage.success('Sync started')
    await loadForums()
  } catch (err: any) {
    ElMessage.error(err.message || 'Sync failed')
  } finally {
    syncing.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadForums(), loadTones()])
  // Default select first board
  if (treeData.value.length > 0) {
    const firstCat = treeData.value[0]
    if (firstCat.boards?.length > 0) {
      selectBoard(firstCat.boards[0])
    }
  }
})
</script>

<style scoped>
.forum-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--bk-header-height) - 48px); /* header + main-content padding */
}
.forum-layout {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0; /* allow flex children to shrink below content size */
}
.forum-tree-panel {
  flex: 0 0 25%;
  min-width: 260px;
  display: flex;
  flex-direction: column;
}
.forum-tree-panel :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.forum-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.forum-detail-panel :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.tree-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tree-panel__title {
  font-weight: 600;
  font-size: 15px;
  color: var(--bk-foreground);
}
.tree-panel__body {
}

/* Category */
.tree-category {
  margin-bottom: 4px;
}
.tree-category__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--bk-radius-sm);
  user-select: none;
  font-weight: 600;
  font-size: 14px;
  color: var(--bk-foreground);
}
.tree-category__header:hover {
  background: var(--bk-muted);
}
.tree-category__arrow {
  transition: transform 0.2s;
  font-size: 12px;
}
.tree-category__arrow.is-expanded {
  transform: rotate(90deg);
}
.tree-category__name {
  flex: 1;
}

/* Board items */
.tree-category__boards {
  padding-left: 12px;
}
.tree-board {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  margin: 2px 0;
  cursor: pointer;
  border-radius: var(--bk-radius-sm);
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: var(--bk-transition);
}
.tree-board:hover {
  background: var(--bk-muted);
}
.tree-board--selected {
  background: #DBEAFE;
  color: #1D4ED8;
  font-weight: 500;
}
.tree-board--selected:hover {
  background: #DBEAFE;
}
.tree-board__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Detail form */
.board-form {
  max-width: 700px;
}
.forum-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
