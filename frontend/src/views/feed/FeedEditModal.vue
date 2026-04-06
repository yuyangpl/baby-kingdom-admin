<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="Edit Feed Content"
    width="700px"
    :close-on-click-modal="false"
  >
    <div v-if="editData" class="feed-edit-modal">
      <!-- Read-only section -->
      <el-descriptions :column="2" border size="small" class="readonly-section">
        <el-descriptions-item label="Feed ID">{{ editData.feedId }}</el-descriptions-item>
        <el-descriptions-item label="Source">
          <el-tag size="small">{{ editData.source }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Thread Subject" :span="2">
          {{ editData.threadSubject || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="Persona ID">{{ editData.personaId }}</el-descriptions-item>
        <el-descriptions-item label="Tone Mode">{{ editData.toneMode }}</el-descriptions-item>
        <el-descriptions-item label="Sensitivity Tier">
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
        <el-form-item label="Content" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            placeholder="Edit generated content..."
          />
          <div class="char-counter">{{ form.content.length }} characters</div>
        </el-form-item>

        <el-form-item label="Tone Mode Override" prop="toneModeOverride">
          <el-input v-model="form.toneModeOverride" placeholder="Leave empty to keep current tone" />
        </el-form-item>

        <el-form-item label="Admin Notes" prop="adminNotes">
          <el-input
            v-model="form.adminNotes"
            type="textarea"
            :rows="2"
            placeholder="Internal notes (not published)"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="modal-footer">
        <el-button @click="$emit('update:modelValue', false)">Cancel</el-button>
        <el-button :loading="savingDraft" @click="handleSaveDraft">Save Draft</el-button>
        <el-button type="success" :loading="savingApprove" @click="handleSaveAndApprove">
          Save &amp; Approve
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  editData: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const formRef = ref(null)
const savingDraft = ref(false)
const savingApprove = ref(false)

const form = reactive({
  content: '',
  toneModeOverride: '',
  adminNotes: '',
})

const tierType = (tier) => {
  const map = { 1: 'success', 2: 'warning', 3: 'danger' }
  return map[tier] || 'info'
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.editData) {
      form.content = props.editData.content || ''
      form.toneModeOverride = ''
      form.adminNotes = props.editData.adminNotes || ''
    }
  }
)

const buildPayload = () => {
  const payload = { content: form.content }
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
    ElMessage.success('Draft saved')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(err.message || 'Failed to save draft')
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
    ElMessage.success('Feed saved and approved')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(err.message || 'Failed to save and approve')
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
