<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">Personas</h2>
      <el-button type="primary" @click="openForm(null)">Add Persona</el-button>
    </div>

    <el-row :gutter="16" v-loading="loading">
      <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="p in personas" :key="p._id" style="margin-bottom:16px">
        <el-card shadow="hover">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:bold">{{ p.username }}</span>
              <el-tag :type="archetypeColor[p.archetype]" size="small">{{ p.archetype }}</el-tag>
            </div>
          </template>
          <p><code>{{ p.accountId }}</code></p>
          <p>Tone: <el-tag size="small">{{ p.primaryToneMode || '-' }}</el-tag></p>
          <p>Posts: {{ p.postsToday ?? 0 }} / {{ p.maxPostsPerDay }}</p>
          <el-tag v-if="!p.isActive" type="danger" size="small">Inactive</el-tag>
          <div style="margin-top:12px;display:flex;gap:8px">
            <el-button size="small" @click="openForm(p)">Edit</el-button>
            <el-popconfirm title="Delete this persona?" @confirm="handleDelete(p._id)">
              <template #reference>
                <el-button size="small" type="danger" plain>Delete</el-button>
              </template>
            </el-popconfirm>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <PersonaForm v-model="showForm" :edit-data="editData" @saved="loadData" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api';
import { ElMessage } from 'element-plus';
import PersonaForm from './PersonaForm.vue';

const personas = ref([]);
const loading = ref(false);
const showForm = ref(false);
const editData = ref(null);

const archetypeColor = { pregnant: 'danger', 'first-time-mom': '', 'multi-kid': 'success', 'school-age': 'warning' };

async function loadData() {
  loading.value = true;
  try {
    const res = await api.get('/v1/personas');
    personas.value = res.data || [];
  } finally {
    loading.value = false;
  }
}

function openForm(data) {
  editData.value = data;
  showForm.value = true;
}

async function handleDelete(id) {
  await api.delete(`/v1/personas/${id}`);
  ElMessage.success('Deleted');
  loadData();
}

onMounted(loadData);
</script>
