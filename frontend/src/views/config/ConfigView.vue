<template>
  <div class="config-view">
    <h2 class="page-title">{{ $t('config.title') }}</h2>

    <el-tabs v-model="activeTab" v-loading="loading" class="config-tabs">
      <el-tab-pane
        v-for="tab in tabList"
        :key="tab.key"
        :label="$t(`config.tabs.${tab.i18nKey}`)"
        :name="tab.key"
      >
        <el-card shadow="never" class="config-tab-card">
        <!-- Config fields -->
        <div class="config-group">
          <div
            v-for="item in configsByCategory(tab.key)"
            :key="item.key"
            class="config-row"
          >
            <div class="config-header">
              <span class="config-key">{{ item.key }}</span>
              <span v-if="item.description" class="config-desc">{{ item.description }}</span>
            </div>
            <div class="config-value-row">
              <el-input
                v-if="item.isSecret"
                v-model="item._editValue"
                type="password"
                show-password
                placeholder="********  (enter new value to change)"
                style="flex: 1"
              />
              <el-input
                v-else-if="isLongText(item.key, item.value)"
                v-model="item._editValue"
                type="textarea"
                :rows="4"
                :autosize="{ minRows: 3, maxRows: 12 }"
                style="flex: 1"
              />
              <el-input
                v-else
                v-model="item._editValue"
                style="flex: 1"
              />
            </div>
          </div>
        </div>

        <!-- MediaLens extra: Token status + OTP -->
        <template v-if="tab.key === 'medialens'">
          <div class="config-section">
            <h4 class="config-section__title">{{ $t('trends.tokenStatus') }}</h4>
            <div class="token-status-card" :class="tokenValid ? 'card--success' : 'card--danger'">
              <div class="token-status-card__row">
                <span
                  class="status-dot"
                  :class="tokenValid ? 'status-dot--active' : 'status-dot--expired'"
                />
                <span>{{ tokenValid ? 'Token Active' : 'Token Expired / Not Set' }}</span>
                <span v-if="tokenExpiry" class="token-status-card__expiry">
                  Expires: {{ tokenExpiry }}
                </span>
              </div>
            </div>

            <div class="otp-section">
              <el-button
                v-if="!otpRequested"
                type="primary"
                @click="requestOtp"
                :loading="otpLoading"
              >
                {{ $t('trends.requestOtp') }}
              </el-button>
              <template v-else>
                <div class="otp-section__input">
                  <el-input
                    v-model="otpCode"
                    placeholder="Enter OTP code"
                    style="width: 200px"
                  />
                  <el-button
                    type="success"
                    @click="verifyOtp"
                    :loading="otpLoading"
                  >
                    {{ $t('trends.verifyOtp') }}
                  </el-button>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Email extra: Send Test -->
        <template v-if="tab.key === 'email'">
          <div class="config-section">
            <el-button type="primary" @click="sendTestEmail" :loading="testEmailLoading">
              {{ $t('config.sendTestEmail') }}
            </el-button>
            <p class="config-section__note">
              Sends a test email to the configured recipient to verify SMTP settings.
            </p>
          </div>
        </template>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Bottom action buttons -->
    <div class="config-actions">
      <el-button @click="resetDefaults">
        {{ $t('config.resetDefaults') }}
      </el-button>
      <el-button type="primary" @click="saveAll" :loading="savingAll">
        {{ $t('config.saveChanges') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import api from '../../api'

const { t } = useI18n()

const configs = ref<any[]>([])
const loading = ref<boolean>(false)
const activeTab = ref<string>('medialens')
const savingAll = ref<boolean>(false)

// MediaLens OTP state
const tokenValid = ref<boolean>(false)
const tokenExpiry = ref<string>('')
const otpRequested = ref<boolean>(false)
const otpCode = ref<string>('')
const otpLoading = ref<boolean>(false)

// Email test
const testEmailLoading = ref<boolean>(false)

const tabList = [
  { key: 'medialens', i18nKey: 'medialens' },
  { key: 'bk-forum', i18nKey: 'bkForum' },
  { key: 'gemini', i18nKey: 'gemini' },
  { key: 'google-trends', i18nKey: 'googleTrends' },
  { key: 'scanner', i18nKey: 'scanner' },
  { key: 'email', i18nKey: 'email' },
  { key: 'general', i18nKey: 'general' },
]

const LONG_TEXT_KEYS = [
  'GEMINI_SYSTEM_PROMPT',
  'GEMINI_REPLY_PROMPT',
  'GEMINI_NEW_POST_PROMPT',
  'SCANNER_SYSTEM_PROMPT',
]

const configsByCategory = (cat: string) => {
  return configs.value.filter((c) => (c.category || 'general') === cat)
}

const isLongText = (key: string, value: any): boolean => {
  if (LONG_TEXT_KEYS.some((k) => key.toUpperCase().includes(k))) return true
  if (typeof value === 'string' && value.length > 100) return true
  return false
}

const loadConfigs = async () => {
  loading.value = true
  try {
    const { data } = await api.get('/v1/configs')
    const list = data ?? []
    configs.value = list.map((c: any) => ({
      ...c,
      _editValue: c.isSecret ? '' : (c.value ?? ''),
      _saving: false,
    }))
  } finally {
    loading.value = false
  }
}

const saveConfig = async (item: any) => {
  if (item.isSecret && !item._editValue) return
  item._saving = true
  try {
    await api.put(`/v1/configs/${item.key}`, { value: item._editValue })
    if (!item.isSecret) {
      item.value = item._editValue
    } else {
      item._editValue = ''
    }
  } catch (err: any) {
    throw err
  } finally {
    item._saving = false
  }
}

const saveAll = async () => {
  savingAll.value = true
  let saved = 0
  let errors = 0
  try {
    for (const item of configs.value) {
      // Skip secret fields with no new value
      if (item.isSecret && !item._editValue) continue
      // Skip non-secret fields that haven't changed
      if (!item.isSecret && item._editValue === (item.value ?? '')) continue
      try {
        await saveConfig(item)
        saved++
      } catch {
        errors++
      }
    }
    if (errors > 0) {
      ElMessage.warning(`Saved ${saved} configs, ${errors} failed`)
    } else if (saved > 0) {
      ElMessage.success(`Saved ${saved} config(s)`)
    } else {
      ElMessage.info('No changes to save')
    }
  } finally {
    savingAll.value = false
  }
}

const resetDefaults = async () => {
  try {
    await ElMessageBox.confirm(
      'This will reset all configs to their default values. Continue?',
      t('config.resetDefaults'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await api.post('/v1/configs/reset')
    ElMessage.success('Configs reset to defaults')
    loadConfigs()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const requestOtp = async () => {
  otpLoading.value = true
  try {
    await api.post('/v1/medialens/request-otp')
    otpRequested.value = true
    ElMessage.success('OTP sent')
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to request OTP')
  } finally {
    otpLoading.value = false
  }
}

const verifyOtp = async () => {
  otpLoading.value = true
  try {
    await api.post('/v1/medialens/verify-otp', { otp: otpCode.value })
    ElMessage.success('OTP verified, token refreshed')
    otpRequested.value = false
    otpCode.value = ''
    tokenValid.value = true
    loadTokenStatus()
  } catch (err: any) {
    ElMessage.error(err.message || 'OTP verification failed')
  } finally {
    otpLoading.value = false
  }
}

const loadTokenStatus = async () => {
  try {
    const res = await api.get('/v1/medialens/token-status')
    const data = (res as any).data || res
    tokenValid.value = !!data.valid
    tokenExpiry.value = data.expiresAt ? new Date(data.expiresAt).toLocaleString() : ''
  } catch {
    tokenValid.value = false
    tokenExpiry.value = ''
  }
}

const sendTestEmail = async () => {
  testEmailLoading.value = true
  try {
    await api.post('/v1/configs/test-email')
    ElMessage.success('Test email sent')
  } catch (err: any) {
    ElMessage.error(err.message || 'Failed to send test email')
  } finally {
    testEmailLoading.value = false
  }
}

onMounted(() => {
  loadConfigs()
  loadTokenStatus()
})
</script>

<style scoped>
.config-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--bk-header-height) - 48px);
}
.config-tabs {
  margin-top: 16px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.config-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.config-tabs :deep(.el-tab-pane) {
  height: 100%;
}
.config-tab-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.config-tab-card :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Config group / rows */
.config-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.config-row {
  padding: 14px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.config-row:last-child {
  border-bottom: none;
}
.config-header {
  margin-bottom: 8px;
}
.config-key {
  font-weight: 700;
  font-size: 14px;
  margin-right: 12px;
}
.config-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.config-value-row {
  display: flex;
  align-items: flex-start;
}

/* Section dividers */
.config-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--bk-border);
}
.config-section__title {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--bk-foreground);
}
.config-section__note {
  margin-top: 8px;
  font-size: 12px;
  color: var(--bk-muted-fg);
}

/* Token status card */
.token-status-card {
  padding: 12px 16px;
  border-radius: var(--bk-radius-sm);
  margin-bottom: 16px;
}
.token-status-card__row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.token-status-card__expiry {
  margin-left: auto;
  font-size: 12px;
  color: var(--bk-muted-fg);
}

/* OTP section */
.otp-section {
  margin-top: 12px;
}
.otp-section__input {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Bottom actions */
.config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  flex-shrink: 0;
}
</style>
