<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('feed.customGenerate')"
    width="500px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="generate-form"
    >
      <el-form-item :label="$t('feed.topic')" prop="topic">
        <el-input v-model="form.topic" :placeholder="$t('feed.placeholder.topic')" />
      </el-form-item>

      <el-form-item :label="$t('feed.persona')" prop="personaAccountId">
        <el-input v-model="form.personaAccountId" :placeholder="$t('feed.placeholder.toneMode')" />
      </el-form-item>

      <el-form-item :label="$t('feed.toneMode')" prop="toneMode">
        <el-input v-model="form.toneMode" placeholder="auto" />
      </el-form-item>

      <el-form-item :label="$t('topicRules.postType')" prop="postType">
        <el-radio-group v-model="form.postType">
          <el-radio value="new-post">New Post</el-radio>
          <el-radio value="reply">Reply</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="Target FID" prop="targetFid">
        <el-input-number
          v-model="form.targetFid"
          :min="0"
          controls-position="right"
          :placeholder="$t('feed.placeholder.targetFid')"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="generating" @click="handleGenerate">
        {{ generating ? $t('common.loading') : $t('feed.customGenerate') }}
      </el-button>
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
  editData?: Record<string, any> | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const formRef = ref<FormInstance>()
const generating = ref<boolean>(false)

interface GenerateForm {
  topic: string
  personaAccountId: string
  toneMode: string
  postType: string
  targetFid: number | undefined
}

const defaultForm = (): GenerateForm => ({
  topic: '',
  personaAccountId: '',
  toneMode: 'auto',
  postType: 'new-post',
  targetFid: undefined,
})

const form = reactive(defaultForm())

const rules = {
  topic: [{ required: true, message: t('common.required'), trigger: 'blur' }],
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      Object.assign(form, defaultForm())
      formRef.value?.clearValidate()
    }
  }
)

const handleGenerate = async () => {
  try {
    await formRef.value!.validate()
  } catch {
    return
  }
  generating.value = true
  try {
    const payload: Record<string, any> = {
      topic: form.topic,
      postType: form.postType,
    }
    if (form.personaAccountId) payload.personaAccountId = form.personaAccountId
    if (form.toneMode && form.toneMode !== 'auto') payload.toneMode = form.toneMode
    if (form.targetFid) payload.targetFid = form.targetFid

    await api.post('/v1/feeds/custom-generate', payload)
    ElMessage.success(t('common.success'))
    emit('saved')
    emit('update:modelValue', false)
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    generating.value = false
  }
}
</script>

<style scoped>
.generate-form {
  padding: 0 4px;
}
</style>
