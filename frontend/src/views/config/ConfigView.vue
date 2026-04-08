<template>
  <div class="config-view">
    <div class="config-header-row">
      <h2 class="page-title">{{ $t('config.title') }}</h2>
      <div class="config-actions">
        <el-button @click="resetDefaults">
          {{ $t('config.resetDefaults') }}
        </el-button>
        <el-button type="primary" @click="saveAll" :loading="savingAll">
          {{ $t('config.saveChanges') }}
        </el-button>
      </div>
    </div>

    <form autocomplete="off" @submit.prevent>
    <el-tabs v-model="activeTab" v-loading="loading" class="config-tabs">
      <el-tab-pane
        v-for="tab in tabList"
        :key="tab.key"
        :label="$t(`config.tabs.${tab.i18nKey}`)"
        :name="tab.key"
      >
        <el-card shadow="never" class="config-tab-card">
        <!-- MediaLens: Token status + OTP (shown first) -->
        <template v-if="tab.key === 'medialens'">
          <div class="config-section" style="margin-top: 0; padding-top: 0; border-top: none; margin-bottom: 20px;">
            <h4 class="config-section__title">{{ $t('trends.tokenStatus') }}</h4>
            <div class="token-status-card" :class="tokenValid ? 'card--success' : 'card--danger'">
              <div class="token-status-card__row">
                <span
                  class="status-dot"
                  :class="tokenValid ? 'status-dot--active' : 'status-dot--expired'"
                />
                <span>{{ tokenValid ? $t('trends.tokenValidUntil', { date: tokenExpiry || '--' }) : $t('trends.tokenExpiredOrMissing') }}</span>
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
                    :placeholder="$t('config.enterOtp')"
                    style="width: 200px"
                    autocomplete="one-time-code"
                    @keyup.enter="verifyOtp"
                  />
                  <el-button
                    type="success"
                    @click="verifyOtp"
                    :loading="otpLoading"
                  >
                    {{ $t('trends.verifyOtp') }}
                  </el-button>
                  <el-button
                    :disabled="otpCountdown > 0"
                    @click="requestOtp"
                    :loading="otpLoading"
                  >
                    {{ otpCountdown > 0 ? `${$t('config.resendOtp')} (${otpCountdown}s)` : $t('config.resendOtp') }}
                  </el-button>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Config fields -->
        <div class="config-group">
          <div
            v-for="item in configsByCategory(tab.key)"
            :key="item.key"
            class="config-row"
          >
            <div class="config-header">
              <span class="config-key">{{ item.key }}</span>
              <span class="config-desc">{{ configDescText(item) }}</span>
            </div>
            <div class="config-value-row">
              <el-input
                v-if="item.isSecret"
                :model-value="item._unlocked ? item._editValue : '••••••••••••'"
                @update:model-value="item._editValue = $event"
                type="text"
                :readonly="!item._unlocked"
                :class="{ 'secret-masked': !item._unlocked }"
                :placeholder="item._unlocked ? $t('config.enterNewValue') : ''"
                autocomplete="off"
                style="flex: 1"
              >
                <template #append>
                  <el-button
                    :icon="item._unlocked ? Lock : Unlock"
                    @click="item._unlocked ? (item._unlocked = false) : unlockSecret(item)"
                  />
                </template>
              </el-input>
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

        <!-- Email extra: Send Test -->
        <template v-if="tab.key === 'email'">
          <div class="config-section">
            <el-button type="primary" @click="sendTestEmail" :loading="testEmailLoading">
              {{ $t('config.sendTestEmail') }}
            </el-button>
            <p class="config-section__note">
              {{ t('config.testEmailNote') }}
            </p>
          </div>
        </template>
        </el-card>
      </el-tab-pane>
    </el-tabs>
    </form>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, Unlock } from '@element-plus/icons-vue'
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

// OTP countdown
const otpCountdown = ref<number>(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const startCountdown = (seconds = 60) => {
  otpCountdown.value = seconds
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    otpCountdown.value--
    if (otpCountdown.value <= 0) {
      clearInterval(countdownTimer!)
      countdownTimer = null
    }
  }, 1000)
}

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

const MEDIALENS_TOP_KEYS = ['MEDIALENS_AUTH_EMAIL', 'MEDIALENS_JWT_TOKEN']

const configsByCategory = (cat: string) => {
  const items = configs.value.filter((c) => (c.category || 'general') === cat)
  if (cat === 'medialens') {
    const top = items.filter(c => MEDIALENS_TOP_KEYS.includes(c.key))
    const rest = items.filter(c => !MEDIALENS_TOP_KEYS.includes(c.key))
    return [...top, ...rest]
  }
  return items
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
      _editValue: c.isSecret ? (c.value || '••••••••') : (c.value ?? ''),
      _saving: false,
      _unlocked: false,
    }))
  } finally {
    loading.value = false
  }
}

const saveConfig = async (item: any) => {
  if (item.isSecret && (!item._unlocked || !item._editValue || item._editValue.startsWith('••'))) return
  item._saving = true
  try {
    await api.put(`/v1/configs/${item.key}`, { value: item._editValue })
    if (!item.isSecret) {
      item.value = item._editValue
    } else {
      item._unlocked = false
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
      // Skip secret fields with no new value or still masked
      if (item.isSecret && (!item._unlocked || !item._editValue || item._editValue.startsWith('••'))) continue
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
      ElMessage.warning(`${saved} ${t('common.updated')}, ${errors} ${t('common.failed')}`)
    } else if (saved > 0) {
      ElMessage.success(`${saved} ${t('common.updated')}`)
    } else {
      ElMessage.info(t('common.noChanges'))
    }
  } finally {
    savingAll.value = false
  }
}

const unlockSecret = async (item: any) => {
  try {
    const { value: password } = await ElMessageBox.prompt(
      t('config.enterPasswordToUnlock'),
      t('config.verifyIdentity'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputType: 'password',
        inputPlaceholder: t('config.loginPassword'),
        inputAttrs: { autocomplete: 'off' },
      }
    )
    if (!password) return
    await api.post('/v1/auth/verify-password', { password })
    // Fetch decrypted value
    const res: any = await api.get(`/v1/configs/reveal/${item.key}`)
    const revealed = res.data || res
    item._editValue = revealed.value || ''
    item._unlocked = true
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(t('config.passwordWrong'))
  }
}

const resetDefaults = async () => {
  try {
    await ElMessageBox.confirm(
      t('common.resetConfirm'),
      t('config.resetDefaults'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await api.post('/v1/configs/reset')
    ElMessage.success(t('config.configsReset'))
    loadConfigs()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const requestOtp = async () => {
  otpLoading.value = true
  try {
    await api.post('/v1/trends/medialens/request-otp')
    otpRequested.value = true
    startCountdown(60)
    ElMessage.success(t('config.otpSent'))
  } catch (err: any) {
    ElMessage.error(err.message || t('config.otpFailed'))
  } finally {
    otpLoading.value = false
  }
}

const verifyOtp = async () => {
  otpLoading.value = true
  try {
    const res: any = await api.post('/v1/trends/medialens/verify-otp', { otp: otpCode.value })
    const result = res.data || res
    if (result.verified === false) {
      ElMessage.error(t('config.otpVerifyFailed'))
      return
    }
    ElMessage.success(t('config.otpVerified'))
    otpRequested.value = false
    otpCode.value = ''
    tokenValid.value = true
    await loadTokenStatus()
    await loadConfigs()
  } catch (err: any) {
    ElMessage.error(err.message || t('config.otpVerifyFailed'))
  } finally {
    otpLoading.value = false
  }
}

const loadTokenStatus = async () => {
  try {
    const res = await api.get('/v1/trends/medialens/token-status')
    const data = (res as any).data || res
    tokenValid.value = !!data.hasToken
    tokenExpiry.value = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : ''
  } catch {
    tokenValid.value = false
    tokenExpiry.value = ''
  }
}

const sendTestEmail = async () => {
  testEmailLoading.value = true
  try {
    await api.post('/v1/configs/test-email')
    ElMessage.success(t('config.testEmailSent'))
  } catch (err: any) {
    ElMessage.error(err.message || t('config.testEmailFailed'))
  } finally {
    testEmailLoading.value = false
  }
}

const configDescText = (item: any): string => {
  const key = `configDesc.${item.key}`
  const translated = t(key)
  return translated !== key ? translated : (item.description || '')
}

onMounted(() => {
  loadConfigs()
  loadTokenStatus()
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
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
  padding-bottom: 2px; /* prevent card bottom border clipping */
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
.config-row:first-child {
  padding-top: 0;
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
.secret-masked :deep(input) {
  color: var(--el-text-color-placeholder);
  letter-spacing: 2px;
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
.config-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.config-actions {
  display: flex;
  gap: 12px;
}
</style>
