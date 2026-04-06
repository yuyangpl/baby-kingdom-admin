<template>
  <div class="persona-view">
    <h2>Personas</h2>

    <el-button type="primary" @click="showAdd = true" style="margin-bottom: 16px">
      Add Persona
    </el-button>

    <el-row :gutter="16" v-loading="loading">
      <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="p in personas" :key="p.accountId" style="margin-bottom: 16px">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>{{ p.username }}</span>
              <el-tag size="small">{{ p.archetype }}</el-tag>
            </div>
          </template>
          <p><strong>Account ID:</strong> {{ p.accountId }}</p>
          <p><strong>Tone:</strong> {{ p.primaryToneMode }}</p>
          <p><strong>Posts:</strong> {{ p.postsToday ?? 0 }} / {{ p.maxPostsPerDay }}</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'

const personas = ref([])
const loading = ref(false)
const showAdd = ref(false)

const loadPersonas = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/personas')
    personas.value = data.data ?? data
  } finally {
    loading.value = false
  }
}

onMounted(loadPersonas)
</script>

<style scoped>
.persona-view {
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
