<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="isEdit ? 'Edit Topic Rule' : 'Add Topic Rule'"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="topic-rule-form"
    >
      <el-form-item label="Rule ID" prop="ruleId">
        <el-input v-model="form.ruleId" :disabled="isEdit" placeholder="e.g. rule_vaccine_01" />
      </el-form-item>

      <el-form-item label="Topic Keywords" prop="topicKeywords">
        <el-input
          v-model="form.topicKeywords"
          type="textarea"
          :rows="2"
          placeholder="Comma separated"
        />
      </el-form-item>

      <el-form-item label="Sensitivity Tier" prop="sensitivityTier">
        <el-radio-group v-model="form.sensitivityTier">
          <el-radio :value="1">
            <el-tag type="success" size="small">Tier 1</el-tag>
          </el-radio>
          <el-radio :value="2">
            <el-tag type="warning" size="small">Tier 2</el-tag>
          </el-radio>
          <el-radio :value="3">
            <el-tag type="danger" size="small">Tier 3</el-tag>
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Sentiment Trigger" prop="sentimentTrigger">
        <el-radio-group v-model="form.sentimentTrigger">
          <el-radio value="any">Any</el-radio>
          <el-radio value="positive">Positive</el-radio>
          <el-radio value="negative">Negative</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Priority Account IDs" prop="priorityAccountIds">
        <el-input
          v-model="form.priorityAccountIds"
          type="textarea"
          :rows="2"
          placeholder="Comma separated account IDs"
        />
      </el-form-item>

      <el-form-item label="Assign Tone Mode" prop="assignToneMode">
        <el-input v-model="form.assignToneMode" placeholder="auto" />
      </el-form-item>

      <el-form-item label="Post Type Preference" prop="postTypePreference">
        <el-radio-group v-model="form.postTypePreference">
          <el-radio value="new-post">New Post</el-radio>
          <el-radio value="reply">Reply</el-radio>
          <el-radio value="any">Any</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Gemini Prompt Hint" prop="geminiPromptHint">
        <el-input
          v-model="form.geminiPromptHint"
          type="textarea"
          :rows="3"
        />
        <div class="field-note">Injected verbatim into prompt</div>
      </el-form-item>

      <el-form-item label="Avoid If" prop="avoidIf">
        <el-input
          v-model="form.avoidIf"
          type="textarea"
          :rows="2"
        />
      </el-form-item>

      <el-form-item label="Active" prop="isActive">
        <el-switch v-model="form.isActive" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">Save</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../../api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  editData: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const isEdit = computed(() => !!props.editData)
const formRef = ref(null)
const saving = ref(false)

const defaultForm = () => ({
  ruleId: '',
  topicKeywords: '',
  sensitivityTier: 1,
  sentimentTrigger: 'any',
  priorityAccountIds: '',
  assignToneMode: 'auto',
  postTypePreference: 'any',
  geminiPromptHint: '',
  avoidIf: '',
  isActive: true,
})

const form = reactive(defaultForm())

const rules = {
  ruleId: [{ required: true, message: 'Rule ID is required', trigger: 'blur' }],
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.editData) {
        const d = props.editData
        Object.assign(form, {
          ruleId: d.ruleId || '',
          topicKeywords: Array.isArray(d.topicKeywords) ? d.topicKeywords.join(', ') : (d.topicKeywords || ''),
          sensitivityTier: d.sensitivityTier ?? 1,
          sentimentTrigger: d.sentimentTrigger || 'any',
          priorityAccountIds: Array.isArray(d.priorityAccountIds) ? d.priorityAccountIds.join(', ') : (d.priorityAccountIds || ''),
          assignToneMode: d.assignToneMode || 'auto',
          postTypePreference: d.postTypePreference || 'any',
          geminiPromptHint: d.geminiPromptHint || '',
          avoidIf: d.avoidIf || '',
          isActive: d.isActive ?? true,
        })
      } else {
        Object.assign(form, defaultForm())
      }
      formRef.value?.clearValidate()
    }
  }
)

const buildPayload = () => {
  const payload = { ...form }
  payload.topicKeywords = form.topicKeywords ? form.topicKeywords.split(',').map(s => s.trim()).filter(Boolean) : []
  payload.priorityAccountIds = form.priorityAccountIds ? form.priorityAccountIds.split(',').map(s => s.trim()).filter(Boolean) : []
  return payload
}

const handleSave = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value) {
      await api.put(`/v1/topic-rules/${form.ruleId}`, payload)
    } else {
      await api.post('/v1/topic-rules', payload)
    }
    ElMessage.success(isEdit.value ? 'Rule updated' : 'Rule created')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(err.message || 'Failed to save rule')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.topic-rule-form {
  padding: 0 4px;
}
.field-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
