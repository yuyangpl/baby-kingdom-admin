<template>
  <div class="persona-view">
    <div class="persona-view__header">
      <h2 class="page-title">{{ $t('persona.title') }}</h2>
      <el-button type="primary" @click="openForm(null)">
        {{ $t('persona.addPersona') }}
      </el-button>
    </div>

    <el-row :gutter="16" v-loading="loading">
      <el-col
        v-for="p in personas"
        :key="p._id"
        :xs="24"
        :sm="12"
        :lg="8"
      >
        <div class="persona-card hover-lift">
          <!-- Top-right badges -->
          <div class="persona-card__badges">
            <span
              class="status-dot"
              :class="p.tokenValid !== false ? 'status-dot--active' : 'status-dot--error'"
            />
            <el-tag
              :type="p.isActive !== false ? 'success' : 'danger'"
              size="small"
              effect="dark"
            >
              {{ p.isActive !== false ? $t('persona.active') : $t('persona.inactive') }}
            </el-tag>
          </div>

          <!-- Account ID chip -->
          <code class="persona-card__account-id">{{ p.accountId }}</code>

          <!-- Avatar -->
          <div class="avatar-gradient persona-card__avatar">
            {{ avatarInitial(p.username) }}
          </div>

          <!-- Username -->
          <div class="persona-card__username">{{ p.username }}</div>

          <!-- Archetype tag -->
          <el-tag
            :type="archetypeColor[p.archetype] || ''"
            size="small"
          >
            {{ p.archetype }}
          </el-tag>

          <!-- Tone mode -->
          <el-tag
            v-if="p.primaryToneMode"
            size="small"
            effect="plain"
            class="persona-card__tone"
          >
            {{ p.primaryToneMode }}
          </el-tag>

          <!-- Posts progress -->
          <div class="persona-card__progress">
            <div class="persona-card__progress-label">
              {{ $t('persona.postsToday') }}: {{ p.postsToday ?? 0 }} / {{ p.maxPostsPerDay }}
            </div>
            <div class="persona-card__progress-bar">
              <div
                class="persona-card__progress-fill"
                :style="{ width: progressPercent(p) + '%' }"
              />
            </div>
          </div>

          <!-- Voice cues preview -->
          <div v-if="p.voiceCues" class="persona-card__voice-cues">
            {{ truncateText(p.voiceCues, 80) }}
          </div>

          <!-- Actions -->
          <div class="persona-card__actions">
            <el-button size="small" @click="openForm(p)">
              {{ $t('common.edit') }}
            </el-button>
            <el-popconfirm :title="$t('persona.deleteConfirm')" @confirm="handleDelete(p._id)">
              <template #reference>
                <el-button size="small" type="danger" plain>{{ $t('common.delete') }}</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-empty v-if="!loading && !personas.length" />

    <PersonaForm v-model="showForm" :edit-data="editData" @saved="loadData" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../../api'
import { ElMessage } from 'element-plus'
import PersonaForm from './PersonaForm.vue'

const personas = ref<any[]>([])
const loading = ref<boolean>(false)
const showForm = ref<boolean>(false)
const editData = ref<Record<string, any> | null>(null)

const archetypeColor: Record<string, string> = {
  pregnant: 'danger',
  'first-time-mom': '',
  'multi-kid': 'success',
  'school-age': 'warning',
}

const avatarInitial = (name: string): string => {
  return name ? name.charAt(0).toUpperCase() : '?'
}

const truncateText = (str: string | undefined, len: number): string => {
  if (!str) return ''
  const text = Array.isArray(str) ? str.join(', ') : String(str)
  return text.length > len ? text.substring(0, len) + '...' : text
}

const progressPercent = (p: any): number => {
  const today = p.postsToday ?? 0
  const max = p.maxPostsPerDay ?? 1
  return Math.min(100, Math.round((today / max) * 100))
}

async function loadData() {
  loading.value = true
  try {
    const res = await api.get('/v1/personas')
    personas.value = res.data || []
  } finally {
    loading.value = false
  }
}

function openForm(data: Record<string, any> | null) {
  editData.value = data
  showForm.value = true
}

async function handleDelete(id: string) {
  await api.delete(`/v1/personas/${id}`)
  ElMessage.success('Deleted')
  loadData()
}

onMounted(loadData)
</script>

<style scoped>
.persona-view {
}
.persona-view__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* Persona Card */
.persona-card {
  position: relative;
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  padding: 20px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

/* Badges top-right */
.persona-card__badges {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Account ID */
.persona-card__account-id {
  background: #F3F4F6;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: var(--bk-muted-fg);
}

/* Avatar */
.persona-card__avatar {
  width: 64px;
  height: 64px;
  font-size: 24px;
  margin-top: 4px;
}

/* Username */
.persona-card__username {
  font-weight: 700;
  font-size: 16px;
  color: var(--bk-foreground);
}

/* Tone tag */
.persona-card__tone {
  margin-top: 2px;
}

/* Progress bar */
.persona-card__progress {
  width: 100%;
  margin-top: 8px;
}
.persona-card__progress-label {
  font-size: 12px;
  color: var(--bk-muted-fg);
  margin-bottom: 4px;
}
.persona-card__progress-bar {
  width: 100%;
  height: 8px;
  background: #E5E7EB;
  border-radius: 4px;
  overflow: hidden;
}
.persona-card__progress-fill {
  height: 100%;
  background: var(--bk-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Voice cues */
.persona-card__voice-cues {
  width: 100%;
  font-size: 12px;
  color: var(--bk-muted-fg);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: left;
  margin-top: 4px;
}

/* Actions */
.persona-card__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
  justify-content: center;
}
</style>
