<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="isEdit ? $t('common.edit') + ' ' + $t('topicRules.ruleId') : $t('topicRules.addRule')"
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
      <el-form-item :label="$t('topicRules.ruleId')" prop="ruleId">
        <el-input v-model="form.ruleId" :disabled="isEdit" placeholder="e.g. rule_vaccine_01" />
      </el-form-item>

      <el-form-item :label="$t('topicRules.keywords')" prop="topicKeywords">
        <el-input
          v-model="form.topicKeywords"
          type="textarea"
          :rows="2"
          :placeholder="$t('common.commasSeparated')"
        />
      </el-form-item>

      <el-form-item :label="$t('topicRules.sensitivityTier')" prop="sensitivityTier">
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

      <el-form-item :label="$t('topicRules.sentimentTrigger')" prop="sentimentTrigger">
        <el-radio-group v-model="form.sentimentTrigger">
          <el-radio value="any">Any</el-radio>
          <el-radio value="positive">Positive</el-radio>
          <el-radio value="negative">Negative</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="$t('topicRules.priorityAccounts')" prop="priorityAccountIds">
        <el-input
          v-model="form.priorityAccountIds"
          type="textarea"
          :rows="2"
          :placeholder="$t('topicRules.accountIdsPlaceholder')"
        />
      </el-form-item>

      <el-form-item :label="$t('topicRules.assignToneMode')" prop="assignToneMode">
        <el-input v-model="form.assignToneMode" placeholder="auto" />
      </el-form-item>

      <el-form-item :label="$t('topicRules.postType')" prop="postTypePreference">
        <el-radio-group v-model="form.postTypePreference">
          <el-radio value="new-post">New Post</el-radio>
          <el-radio value="reply">Reply</el-radio>
          <el-radio value="any">Any</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="$t('topicRules.promptHint')" prop="geminiPromptHint">
        <el-input
          v-model="form.geminiPromptHint"
          type="textarea"
          :rows="3"
        />
        <div class="field-note">Injected verbatim into prompt</div>
      </el-form-item>

      <el-form-item :label="$t('topicRules.avoidIf')" prop="avoidIf">
        <el-input
          v-model="form.avoidIf"
          type="textarea"
          :rows="2"
        />
      </el-form-item>

      <el-form-item :label="$t('persona.active')" prop="isActive">
        <el-switch v-model="form.isActive" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">{{ $t('common.save') }}</el-button>
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
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const isEdit = computed(() => !!props.editData)
const formRef = ref<FormInstance>()
const saving = ref<boolean>(false)

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

const buildPayload = (): Record<string, any> => {
  const payload: Record<string, any> = { ...form }
  payload.topicKeywords = form.topicKeywords ? form.topicKeywords.split(',').map(s => s.trim()).filter(Boolean) : []
  payload.priorityAccountIds = form.priorityAccountIds ? form.priorityAccountIds.split(',').map(s => s.trim()).filter(Boolean) : []
  return payload
}

const handleSave = async () => {
  try {
    await formRef.value!.validate()
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
    ElMessage.success(t(isEdit.value ? 'topicRules.ruleUpdated' : 'topicRules.ruleCreated'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('common.saveFailed'))
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
