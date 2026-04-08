<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('feed.editContent')"
    width="700px"
    :close-on-click-modal="false"
  >
    <div v-if="editData" class="feed-edit-modal">
      <!-- Read-only section -->
      <el-descriptions :column="2" border size="small" class="readonly-section">
        <el-descriptions-item :label="$t('feed.feedId')">{{ editData.feedId }}</el-descriptions-item>
        <el-descriptions-item :label="$t('trends.source')">
          <el-tag size="small">{{ editData.source }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('feed.threadSubject')" :span="2">
          {{ editData.threadSubject || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('feed.persona')">{{ editData.personaId }}</el-descriptions-item>
        <el-descriptions-item :label="$t('feed.toneMode')">{{ toneLabel(editData.toneMode) }}</el-descriptions-item>
        <el-descriptions-item :label="$t('feed.sensitivityTier')">
          <el-tag
            :type="tierType(editData.sensitivityTier)"
            size="small"
          >
            Tier {{ editData.sensitivityTier }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <!-- Editable section -->
      <el-form
        ref="formRef"
        :model="form"
        label-position="top"
        class="edit-section"
      >
        <el-form-item :label="$t('feed.content')" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            :placeholder="$t('feed.content')"
          />
          <div class="char-counter">{{ form.content.length }} characters</div>
        </el-form-item>

        <el-form-item :label="$t('feed.toneMode')" prop="toneModeOverride">
          <el-select v-model="form.toneModeOverride" :placeholder="$t('persona.selectTone')" style="width: 100%" clearable :loading="tonesLoading">
            <el-option v-for="t in tones" :key="t.toneId" :label="`${t.displayName} (${t.toneId})`" :value="t.toneId" />
          </el-select>
        </el-form-item>

        <el-form-item :label="$t('feed.adminNotes')" prop="adminNotes">
          <el-input
            v-model="form.adminNotes"
            type="textarea"
            :rows="2"
            :placeholder="$t('feed.adminNotes')"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="modal-footer">
        <el-button @click="$emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
        <el-button :loading="savingDraft" @click="handleSaveDraft">{{ $t('common.save') }}</el-button>
        <el-button type="success" :loading="savingApprove" @click="handleSaveAndApprove">
          {{ $t('common.save') }} &amp; {{ $t('feed.approve') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  editData: Record<string, any> | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const formRef = ref<FormInstance>()
const savingDraft = ref<boolean>(false)
const savingApprove = ref<boolean>(false)

const tones = ref<{ toneId: string; displayName: string }[]>([])
const tonesLoading = ref(false)

const loadTones = async () => {
  if (tones.value.length > 0) return
  tonesLoading.value = true
  try {
    const res = await api.get('/v1/tones')
    tones.value = (res.data || res).map((t: any) => ({ toneId: t.toneId, displayName: t.displayName }))
  } catch { /* ignore */ }
  tonesLoading.value = false
}

const toneLabel = (toneId: string): string => {
  const t = tones.value.find(t => t.toneId === toneId)
  return t ? `${t.displayName} (${toneId})` : toneId
}

const form = reactive({
  content: '',
  toneModeOverride: '',
  adminNotes: '',
})

const tierType = (tier: number): string => {
  const map: Record<number, string> = { 1: 'success', 2: 'warning', 3: 'danger' }
  return map[tier] || 'info'
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.editData) {
      loadTones()
      form.content = props.editData.content || ''
      form.toneModeOverride = ''
      form.adminNotes = props.editData.adminNotes || ''
    }
  }
)

const buildPayload = (): Record<string, any> => {
  const payload: Record<string, any> = { content: form.content }
  if (form.toneModeOverride) payload.toneMode = form.toneModeOverride
  if (form.adminNotes) payload.adminNotes = form.adminNotes
  return payload
}

const saveContent = async () => {
  const feedId = props.editData?.feedId
  if (!feedId) return
  await api.put(`/v1/feeds/${feedId}/content`, buildPayload())
}

const handleSaveDraft = async () => {
  savingDraft.value = true
  try {
    await saveContent()
    ElMessage.success(t('common.success'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    savingDraft.value = false
  }
}

const handleSaveAndApprove = async () => {
  savingApprove.value = true
  try {
    await saveContent()
    const feedId = props.editData?.feedId
    await api.post(`/v1/feeds/${feedId}/approve`)
    ElMessage.success(t('common.success'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    savingApprove.value = false
  }
}
</script>

<style scoped>
.feed-edit-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.readonly-section {
  margin-bottom: 8px;
}
.edit-section {
  padding: 0 4px;
}
.char-counter {
  text-align: right;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
