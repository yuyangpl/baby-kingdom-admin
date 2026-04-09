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
        <el-select v-model="form.personaAccountId" filterable clearable :placeholder="$t('feed.placeholder.toneMode')" style="width: 100%" :loading="personasLoading">
          <el-option v-for="p in personas" :key="p.accountId" :label="`${p.accountId} — ${p.username} (${$t('persona.archetypeOptions.' + p.archetype)})`" :value="p.accountId" />
        </el-select>
      </el-form-item>

      <el-form-item :label="$t('feed.toneMode')" prop="toneMode">
        <el-select v-model="form.toneMode" :placeholder="$t('persona.selectTone')" style="width: 100%" :loading="tonesLoading">
          <el-option label="Auto" value="auto" />
          <el-option v-for="t in tones" :key="t.toneId" :label="`${t.displayName} (${t.toneId})`" :value="t.toneId" />
        </el-select>
      </el-form-item>

      <el-form-item :label="$t('feed.targetFid')" prop="targetFid">
        <el-select v-model="form.targetFid" filterable clearable :placeholder="$t('feed.placeholder.targetFid')" style="width: 100%" :loading="boardsLoading">
          <el-option v-for="b in boards" :key="b.fid" :label="`${b.name} (fid:${b.fid})`" :value="b.fid" />
        </el-select>
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

const tones = ref<{ toneId: string; displayName: string }[]>([])
const tonesLoading = ref(false)
const personas = ref<{ accountId: string; username: string; archetype: string }[]>([])
const personasLoading = ref(false)
const boards = ref<{ fid: number; name: string }[]>([])
const boardsLoading = ref(false)

const loadOptions = async () => {
  if (tones.value.length === 0) {
    tonesLoading.value = true
    try {
      const res = await api.get('/v1/tones')
      tones.value = (res.data || res).map((t: any) => ({ toneId: t.toneId, displayName: t.displayName }))
    } catch { /* ignore */ }
    tonesLoading.value = false
  }
  if (personas.value.length === 0) {
    personasLoading.value = true
    try {
      const res = await api.get('/v1/personas', { params: { limit: 100 } })
      const list = res.data || res
      personas.value = (Array.isArray(list) ? list : []).map((p: any) => ({ accountId: p.accountId, username: p.username, archetype: p.archetype || '' }))
    } catch { /* ignore */ }
    personasLoading.value = false
  }
  if (boards.value.length === 0) {
    boardsLoading.value = true
    try {
      const res = await api.get('/v1/forums')
      const tree = res.data || res
      const list: { fid: number; name: string }[] = []
      for (const cat of (Array.isArray(tree) ? tree : [])) {
        for (const b of (cat.boards || [])) {
          list.push({ fid: b.fid, name: b.name })
        }
      }
      boards.value = list
    } catch { /* ignore */ }
    boardsLoading.value = false
  }
}

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
  targetFid: [{ required: true, message: t('common.required'), trigger: 'change' }],
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      loadOptions()
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
