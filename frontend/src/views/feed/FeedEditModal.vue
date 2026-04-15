<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('feed.editContent')"
    width="750px"
    :close-on-click-modal="false"
  >
    <div v-if="editData" class="feed-edit-modal">
      <!-- Read-only info -->
      <el-descriptions :column="2" border size="small" class="readonly-section">
        <el-descriptions-item :label="$t('feed.feedId')">
          <code>{{ editData.feedId }}</code>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('trends.source')">
          <el-tag v-for="s in (Array.isArray(editData.source) ? editData.source : [editData.source])" :key="s" size="small" style="margin-right: 4px;">{{ s }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('feed.board')">
          {{ editData.threadFid ? (boardMap?.[editData.threadFid] || `fid:${editData.threadFid}`) : '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('feed.sensitivityTier')">
          <el-tag :type="tierType(editData.sensitivityTier)" size="small">
            {{ editData.sensitivityTier || '-' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="$t('feed.threadSubject')" :span="2">
          {{ editData.subject || editData.threadSubject || '-' }}
          <a v-if="editData.threadTid" :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${editData.threadTid}`" target="_blank" rel="noopener" style="margin-left: 8px; font-size: 12px;">{{ $t('feed.viewThread') }} ↗</a>
        </el-descriptions-item>
      </el-descriptions>

      <!-- Original thread content -->
      <div v-if="editData.threadContent?.trim()" class="original-content">
        <div class="section-label">{{ $t('feed.originalThread') }}</div>
        <div class="content-box content-box--muted">{{ editData.threadContent }}</div>
      </div>

      <!-- Trend summary -->
      <div v-if="editData.trendSummary" class="original-content">
        <div class="section-label">{{ $t('feed.trendSummary') }}</div>
        <div class="content-box content-box--muted">{{ editData.trendSummary }}</div>
      </div>

      <!-- Editable form -->
      <el-form ref="formRef" :model="form" label-position="top" class="edit-section">
        <el-form-item v-if="isNewPost" :label="$t('feed.threadSubject')" prop="subject">
          <el-input v-model="form.subject" :placeholder="$t('feed.threadSubject')" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item :label="$t('feed.persona')">
              <el-select v-model="form.personaId" filterable style="width: 100%" :loading="personasLoading">
                <el-option v-for="p in personas" :key="p.accountId" :label="`${p.accountId} — ${p.username} (${$t('persona.archetypeOptions.' + p.archetype)})`" :value="p.accountId" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('feed.toneMode')">
              <el-select v-model="form.toneMode" style="width: 100%" clearable :loading="tonesLoading">
                <el-option v-for="t in tones" :key="t.toneId" :label="`${t.displayName} (${t.toneId})`" :value="t.toneId" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item :label="$t('feed.content')" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            :placeholder="$t('feed.content')"
          />
          <div class="char-counter">{{ $t('feed.charCount', { count: form.content.length }) }}</div>
        </el-form-item>

        <el-form-item :label="$t('feed.adminNotes')">
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
        <el-button type="warning" :loading="regenerating" @click="handleRegenerate">{{ $t('feed.regenerate') }}</el-button>
        <el-button :loading="savingDraft" @click="handleSaveDraft">{{ $t('common.save') }}</el-button>
        <el-button v-if="!isApproved" type="success" :loading="savingApprove" @click="handleSaveAndApprove">
          {{ $t('common.save') }} &amp; {{ $t('feed.approve') }}
        </el-button>
        <el-button v-if="isApproved" type="success" :loading="savingApprove" @click="handleSaveAndPost">
          {{ $t('common.save') }} &amp; {{ $t('myDashboard.publish') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  editData: Record<string, any> | null
  boardMap?: Record<number, string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const formRef = ref<FormInstance>()
const savingDraft = ref(false)
const savingApprove = ref(false)
const regenerating = ref(false)

const tones = ref<{ toneId: string; displayName: string }[]>([])
const tonesLoading = ref(false)
const personas = ref<{ accountId: string; username: string; archetype: string }[]>([])

const personasLoading = ref(false)

const loadTones = async () => {
  if (tones.value.length > 0) return
  tonesLoading.value = true
  try {
    const res = await api.get('/v1/tones')
    tones.value = (res.data || res).map((t: any) => ({ toneId: t.toneId, displayName: t.displayName }))
  } catch { /* ignore */ }
  tonesLoading.value = false
}

const loadPersonas = async () => {
  if (personas.value.length > 0) return
  personasLoading.value = true
  try {
    const res = await api.get('/v1/personas', { params: { limit: 100 } })
    const list = res.data || res
    personas.value = (Array.isArray(list) ? list : []).map((p: any) => ({ accountId: p.accountId, username: p.username, archetype: p.archetype || '' }))
  } catch { /* ignore */ }
  personasLoading.value = false
}

const toneLabel = (toneId: string): string => {
  const t = tones.value.find(t => t.toneId === toneId)
  return t ? `${t.displayName} (${toneId})` : toneId
}

const form = reactive({
  subject: '',
  content: '',
  toneMode: '',
  personaId: '',
  adminNotes: '',
})

const isApproved = computed(() => props.editData?.status === 'approved')
const isNewPost = computed(() => props.editData?.postType === 'new-post')

const tierType = (tier: string | number): string => {
  const s = String(tier || '')
  if (s.includes('3')) return 'danger'
  if (s.includes('2')) return 'warning'
  return 'success'
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.editData) {
      loadTones()
      loadPersonas()
      form.subject = props.editData.subject || props.editData.threadSubject || ''
      form.content = props.editData.finalContent || props.editData.draftContent || ''
      form.toneMode = props.editData.toneMode || ''
      form.personaId = props.editData.personaId || ''
      form.adminNotes = props.editData.adminNotes || ''
    }
  }
)

const buildPayload = (): Record<string, any> => {
  const payload: Record<string, any> = { content: form.content }
  if (isNewPost.value && form.subject) payload.subject = form.subject
  if (form.toneMode) payload.toneMode = form.toneMode
  if (form.personaId && form.personaId !== props.editData?.personaId) payload.personaId = form.personaId
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

const handleRegenerate = async () => {
  const feedId = props.editData?.feedId
  if (!feedId) return
  regenerating.value = true
  try {
    await api.post(`/v1/feeds/${feedId}/regenerate`)
    // 重新加载 feed 内容
    const res = await api.get(`/v1/feeds/${feedId}`)
    const data = res.data || res
    form.content = data.finalContent || data.draftContent || ''
    ElMessage.success(t('feed.regenerate'))
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    regenerating.value = false
  }
}

const handleSaveAndPost = async () => {
  savingApprove.value = true
  try {
    await saveContent()
    const id = props.editData?.id || props.editData?._id
    await api.post(`/v1/poster/${id}/post`)
    ElMessage.success(t('feed.postSuccess'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    savingApprove.value = false
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
  margin-bottom: 4px;
}
.original-content {
  margin-bottom: 4px;
}
.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 6px;
}
.content-box {
  padding: 10px 12px;
  border-radius: 4px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
  max-height: 150px;
  overflow-y: auto;
  overflow-x: hidden;
}
.content-box--muted {
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  color: #606266;
}
.content-box--preview {
  background: var(--el-fill-color-lighter, #fafafa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  color: var(--el-text-color-regular, #606266);
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
