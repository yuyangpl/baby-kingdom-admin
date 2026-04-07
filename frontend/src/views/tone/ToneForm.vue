<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="isEdit ? $t('common.edit') + ' ' + $t('tone.title') : $t('tone.addTone')"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="tone-form"
    >
      <el-form-item :label="$t('tone.toneId')" prop="toneId">
        <el-input v-model="form.toneId" :disabled="isEdit" placeholder="e.g. warm, humorous" />
      </el-form-item>

      <el-form-item :label="$t('tone.displayName')" prop="displayName">
        <el-input v-model="form.displayName" placeholder="Human-readable name" />
      </el-form-item>

      <el-form-item :label="$t('tone.whenToUse')" prop="whenToUse">
        <el-input v-model="form.whenToUse" type="textarea" :rows="2" />
      </el-form-item>

      <el-form-item :label="$t('tone.emotionalRegister')" prop="emotionalRegister">
        <el-input v-model="form.emotionalRegister" type="textarea" :rows="2" />
      </el-form-item>

      <el-form-item :label="$t('tone.openingStyle')" prop="openingStyle">
        <el-input v-model="form.openingStyle" type="textarea" :rows="2" />
        <div class="field-note">Injected into Gemini prompt</div>
      </el-form-item>

      <el-form-item :label="$t('tone.sentenceHints')" prop="sentenceStructure">
        <el-input v-model="form.sentenceStructure" type="textarea" :rows="2" />
        <div class="field-note">Injected into Gemini prompt</div>
      </el-form-item>

      <el-form-item :label="$t('tone.whatToAvoid')" prop="whatToAvoid">
        <el-input v-model="form.whatToAvoid" type="textarea" :rows="2" />
        <div class="field-note">Injected as negative constraint</div>
      </el-form-item>

      <el-form-item :label="$t('tone.exampleOpening')" prop="exampleOpening">
        <el-input v-model="form.exampleOpening" type="textarea" :rows="2" />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item :label="$t('tone.tier3Suitable')" prop="suitableForTier3">
            <el-switch v-model="form.suitableForTier3" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="$t('tone.priority')" prop="overridePriority">
            <el-input-number v-model="form.overridePriority" :min="1" :max="10" />
          </el-form-item>
        </el-col>
      </el-row>

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
  toneId: '',
  displayName: '',
  whenToUse: '',
  emotionalRegister: '',
  openingStyle: '',
  sentenceStructure: '',
  whatToAvoid: '',
  exampleOpening: '',
  suitableForTier3: false,
  overridePriority: 5,
  isActive: true,
})

const form = reactive(defaultForm())

const rules = {
  toneId: [{ required: true, message: 'Tone ID is required', trigger: 'blur' }],
  displayName: [{ required: true, message: 'Display Name is required', trigger: 'blur' }],
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.editData) {
        const d = props.editData
        Object.assign(form, {
          toneId: d.toneId || '',
          displayName: d.displayName || '',
          whenToUse: d.whenToUse || '',
          emotionalRegister: d.emotionalRegister || '',
          openingStyle: d.openingStyle || '',
          sentenceStructure: d.sentenceStructure || '',
          whatToAvoid: d.whatToAvoid || '',
          exampleOpening: d.exampleOpening || '',
          suitableForTier3: d.suitableForTier3 ?? false,
          overridePriority: d.overridePriority ?? 5,
          isActive: d.isActive ?? true,
        })
      } else {
        Object.assign(form, defaultForm())
      }
      formRef.value?.clearValidate()
    }
  }
)

const handleSave = async () => {
  try {
    await formRef.value!.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await api.put(`/v1/tones/${form.toneId}`, form)
    } else {
      await api.post('/v1/tones', form)
    }
    ElMessage.success(isEdit.value ? 'Tone updated' : 'Tone created')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to save tone')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tone-form {
  padding: 0 4px;
}
.field-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
