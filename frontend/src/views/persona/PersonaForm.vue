<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="isEdit ? 'Edit Persona' : 'Add Persona'"
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
      <el-form-item label="Account ID" prop="accountId">
        <el-input v-model="form.accountId" :disabled="isEdit" placeholder="e.g. acc_001" />
      </el-form-item>

      <el-form-item label="Username" prop="username">
        <el-input v-model="form.username" placeholder="Display username" />
      </el-form-item>

      <el-form-item label="Archetype" prop="archetype">
        <el-select v-model="form.archetype" placeholder="Select archetype" style="width: 100%">
          <el-option label="Pregnant" value="pregnant" />
          <el-option label="First-time Mom" value="first-time-mom" />
          <el-option label="Multi-kid" value="multi-kid" />
          <el-option label="School Age" value="school-age" />
        </el-select>
      </el-form-item>

      <el-form-item label="Primary Tone Mode" prop="primaryToneMode">
        <el-input v-model="form.primaryToneMode" placeholder="e.g. warm" />
      </el-form-item>

      <el-form-item label="Secondary Tone Mode" prop="secondaryToneMode">
        <el-input v-model="form.secondaryToneMode" placeholder="e.g. humorous" />
      </el-form-item>

      <el-form-item label="Avoided Tone Mode" prop="avoidedToneMode">
        <el-input v-model="form.avoidedToneMode" placeholder="e.g. aggressive" />
      </el-form-item>

      <el-form-item label="Voice Cues" prop="voiceCues">
        <el-input
          v-model="form.voiceCues"
          type="textarea"
          :rows="3"
          placeholder="One per line"
        />
      </el-form-item>

      <el-form-item label="Catchphrases" prop="catchphrases">
        <el-input
          v-model="form.catchphrases"
          type="textarea"
          :rows="3"
          placeholder="One per line"
        />
      </el-form-item>

      <el-form-item label="Tier 3 Script" prop="tier3Script">
        <el-input
          v-model="form.tier3Script"
          type="textarea"
          :rows="4"
        />
      </el-form-item>

      <el-form-item label="Topic Blacklist" prop="topicBlacklist">
        <el-input
          v-model="form.topicBlacklist"
          type="textarea"
          :rows="2"
          placeholder="Comma separated"
        />
      </el-form-item>

      <el-form-item label="Max Posts Per Day" prop="maxPostsPerDay">
        <el-input-number v-model="form.maxPostsPerDay" :min="1" :max="20" />
      </el-form-item>

      <el-form-item label="BK Password" prop="bkPassword">
        <el-input v-model="form.bkPassword" type="password" show-password placeholder="Baby Kingdom login password" />
      </el-form-item>

      <el-form-item label="Override Notes" prop="overrideNotes">
        <el-input
          v-model="form.overrideNotes"
          type="textarea"
          :rows="2"
        />
      </el-form-item>

      <el-form-item label="Active" prop="isActive">
        <el-switch v-model="form.isActive" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="$emit('update:modelValue', false)">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">Save</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import api from '../../api'

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
  accountId: [{ required: true, message: 'Account ID is required', trigger: 'blur' }],
  username: [{ required: true, message: 'Username is required', trigger: 'blur' }],
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
    ElMessage.success(isEdit.value ? 'Persona updated' : 'Persona created')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to save persona')
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
