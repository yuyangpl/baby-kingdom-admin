<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="isEdit ? $t('common.edit') + ' ' + $t('persona.title') : $t('persona.addPersona')"
    direction="rtl"
    size="480px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="persona-form"
    >
      <el-form-item :label="$t('persona.accountId')" prop="accountId">
        <el-input v-model="form.accountId" :disabled="isEdit" placeholder="e.g. acc_001" />
      </el-form-item>

      <el-form-item :label="$t('persona.username')" prop="username">
        <el-input v-model="form.username" :placeholder="$t('persona.usernamePlaceholder')" />
      </el-form-item>

      <el-form-item :label="$t('persona.archetype')" prop="archetype">
        <el-select v-model="form.archetype" :placeholder="$t('persona.selectArchetype')" style="width: 100%">
          <el-option :label="$t('persona.archetypeOptions.pregnant')" value="pregnant" />
          <el-option :label="$t('persona.archetypeOptions.first-time-mom')" value="first-time-mom" />
          <el-option :label="$t('persona.archetypeOptions.multi-kid')" value="multi-kid" />
          <el-option :label="$t('persona.archetypeOptions.school-age')" value="school-age" />
        </el-select>
      </el-form-item>

      <el-form-item :label="$t('persona.primaryTone')" prop="primaryToneMode">
        <el-input v-model="form.primaryToneMode" placeholder="e.g. warm" />
      </el-form-item>

      <el-form-item :label="$t('persona.secondaryTone')" prop="secondaryToneMode">
        <el-input v-model="form.secondaryToneMode" placeholder="e.g. humorous" />
      </el-form-item>

      <el-form-item :label="$t('persona.avoidedTone')" prop="avoidedToneMode">
        <el-input v-model="form.avoidedToneMode" placeholder="e.g. aggressive" />
      </el-form-item>

      <el-form-item :label="$t('persona.voiceCues')" prop="voiceCues">
        <el-input
          v-model="form.voiceCues"
          type="textarea"
          :rows="3"
          :placeholder="$t('common.onePerLine')"
        />
      </el-form-item>

      <el-form-item :label="$t('persona.catchphrases')" prop="catchphrases">
        <el-input
          v-model="form.catchphrases"
          type="textarea"
          :rows="3"
          :placeholder="$t('common.onePerLine')"
        />
      </el-form-item>

      <el-form-item :label="$t('persona.tier3Script')" prop="tier3Script">
        <el-input
          v-model="form.tier3Script"
          type="textarea"
          :rows="4"
        />
      </el-form-item>

      <el-form-item :label="$t('persona.topicBlacklist')" prop="topicBlacklist">
        <el-input
          v-model="form.topicBlacklist"
          type="textarea"
          :rows="2"
          :placeholder="$t('common.commasSeparated')"
        />
      </el-form-item>

      <el-form-item :label="$t('persona.maxPostsPerDay')" prop="maxPostsPerDay">
        <el-input-number v-model="form.maxPostsPerDay" :min="1" :max="20" />
      </el-form-item>

      <el-form-item :label="$t('persona.bkPassword')" prop="bkPassword">
        <el-input v-model="form.bkPassword" type="password" show-password :placeholder="$t('persona.bkPasswordPlaceholder')" />
      </el-form-item>

      <el-form-item :label="$t('persona.overrideNotes')" prop="overrideNotes">
        <el-input
          v-model="form.overrideNotes"
          type="textarea"
          :rows="2"
        />
      </el-form-item>

      <el-form-item :label="$t('persona.active')" prop="isActive">
        <el-switch v-model="form.isActive" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="$emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ $t('common.save') }}</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const props = defineProps<{
  modelValue: boolean
  editData: Record<string, any> | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const { t } = useI18n()
const isEdit = computed(() => !!props.editData)
const formRef = ref<FormInstance>()
const saving = ref<boolean>(false)

const defaultForm = () => ({
  accountId: '',
  username: '',
  archetype: '',
  primaryToneMode: '',
  secondaryToneMode: '',
  avoidedToneMode: '',
  voiceCues: '',
  catchphrases: '',
  tier3Script: '',
  topicBlacklist: '',
  maxPostsPerDay: 5,
  bkPassword: '',
  overrideNotes: '',
  isActive: true,
})

const form = reactive(defaultForm())

const rules = {
  accountId: [{ required: true, message: () => t('common.fieldRequired'), trigger: 'blur' }],
  username: [{ required: true, message: () => t('common.fieldRequired'), trigger: 'blur' }],
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.editData) {
        const d = props.editData
        Object.assign(form, {
          accountId: d.accountId || '',
          username: d.username || '',
          archetype: d.archetype || '',
          primaryToneMode: d.primaryToneMode || '',
          secondaryToneMode: d.secondaryToneMode || '',
          avoidedToneMode: d.avoidedToneMode || '',
          voiceCues: Array.isArray(d.voiceCues) ? d.voiceCues.join('\n') : (d.voiceCues || ''),
          catchphrases: Array.isArray(d.catchphrases) ? d.catchphrases.join('\n') : (d.catchphrases || ''),
          tier3Script: d.tier3Script || '',
          topicBlacklist: Array.isArray(d.topicBlacklist) ? d.topicBlacklist.join(', ') : (d.topicBlacklist || ''),
          maxPostsPerDay: d.maxPostsPerDay ?? 5,
          bkPassword: '',
          overrideNotes: d.overrideNotes || '',
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
  payload.voiceCues = form.voiceCues ? form.voiceCues.split('\n').map(s => s.trim()).filter(Boolean) : []
  payload.catchphrases = form.catchphrases ? form.catchphrases.split('\n').map(s => s.trim()).filter(Boolean) : []
  payload.topicBlacklist = form.topicBlacklist ? form.topicBlacklist.split(',').map(s => s.trim()).filter(Boolean) : []
  if (!payload.bkPassword) delete payload.bkPassword
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
      await api.put(`/v1/personas/${form.accountId}`, payload)
    } else {
      await api.post('/v1/personas', payload)
    }
    ElMessage.success(t('common.success'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.persona-form {
  padding: 0 4px;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
