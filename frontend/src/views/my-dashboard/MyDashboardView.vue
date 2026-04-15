<template>
  <div v-loading="pageLoading" class="my-dashboard">
    <h1 class="page-title">{{ $t('myDashboard.title') }}</h1>

    <!-- Start Review CTA (no active workbench) -->
    <div v-if="!workbenchActive" class="cta-wrapper">
      <div class="cta-card">
        <div class="cta-card__stats">
          <div class="cta-stat">
            <span class="cta-stat__value">{{ teamStats.unclaimed }}</span>
            <span class="cta-stat__label">{{ $t('myDashboard.poolLabel') }}</span>
          </div>
          <div class="cta-stat-divider"></div>
          <div class="cta-stat">
            <span class="cta-stat__value cta-stat__value--claimed">{{ teamStats.claimed }}</span>
            <span class="cta-stat__label">{{ $t('myDashboard.claimedLabel') }}</span>
          </div>
        </div>
        <el-button type="primary" :loading="claiming" :disabled="pageLoading" class="cta-btn" @click="startReview">
          {{ $t('myDashboard.startReview') }}
        </el-button>
      </div>
    </div>

    <!-- Workbench: focused single-item view -->
    <template v-if="workbenchActive && currentFeed">
      <div class="workbench-bar">
        <span class="workbench-progress">
          {{ $t('myDashboard.workbenchLabel') }} ({{ workbenchIndex + 1 }} / {{ claimedTotal }})
        </span>
        <span class="workbench-ttl">{{ ttlDisplay }}</span>
        <el-button @click="exitWorkbench">{{ $t('myDashboard.exitWorkbench') }}</el-button>
      </div>

      <!-- Feed card (same format as FeedView) -->
      <div class="feed-card">
        <!-- Header -->
        <div class="feed-card__header">
          <div class="feed-card__header-left">
            <code class="feed-id-chip">{{ currentFeed.feedId }}</code>
            <span class="feed-card__time">{{ formatTime(currentFeed.createdAt) }}</span>
            <el-tag v-if="currentFeed.threadFid" size="small" type="info" effect="plain" style="margin-left: 4px;">
              {{ boardName(currentFeed.threadFid) }}
            </el-tag>
            <span v-if="currentFeed.threadTid" class="feed-card__meta">tid:{{ currentFeed.threadTid }}</span>
          </div>
          <div class="feed-card__header-right">
            <el-tag :type="currentFeed.status === 'approved' ? 'success' : 'warning'" size="small">{{ currentFeed.status }}</el-tag>
            <el-tag v-for="s in normSources(currentFeed)" :key="s" size="small" effect="plain" style="margin-left: 2px;">{{ $t(`feed.sources.${s}`) }}</el-tag>
          </div>
        </div>

        <!-- Body -->
        <div class="feed-card__body">
          <div class="feed-card__content">
            <div class="feed-card__subject">
              <el-tag v-if="currentFeed.postType" size="small" :type="currentFeed.postType === 'new-post' ? 'warning' : 'info'" effect="plain" style="margin-right: 6px;">
                {{ currentFeed.postType === 'new-post' ? $t('common.newPost') : $t('common.reply') }}
              </el-tag>
              {{ currentFeed.subject || currentFeed.threadSubject }}
              <a
                v-if="currentFeed.threadTid"
                class="feed-card__view-thread"
                :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${currentFeed.threadTid}`"
                target="_blank"
                rel="noopener"
              >{{ $t('feed.viewThread') }} ↗</a>
            </div>
            <div v-if="currentFeed.trendSummary" class="feed-card__trend-summary">{{ currentFeed.trendSummary }}</div>
            <!-- 源贴文 -->
            <div v-if="currentFeed.threadContent?.trim()" class="feed-card__original">
              <span class="feed-card__original-label">{{ $t('myDashboard.originalPost') }}</span>
              <div class="feed-card__original-box">{{ currentFeed.threadContent }}</div>
            </div>
            <!-- 将要发布的内容 -->
            <div v-if="currentFeed.finalContent || currentFeed.draftContent">
              <span class="feed-card__preview-label">{{ currentFeed.postType === 'new-post' ? $t('feed.newPostContent') : $t('feed.replyContent') }}</span>
              <div class="feed-card__draft-box">{{ currentFeed.finalContent || currentFeed.draftContent }}</div>
            </div>
          </div>
          <!-- Persona -->
          <div v-if="currentFeed.bkUsername" class="feed-card__persona">
            <div class="avatar-gradient feed-card__avatar">{{ avatarInitial(currentFeed.bkUsername) }}</div>
            <div class="feed-card__persona-name">
              {{ currentFeed.bkUsername }}
              <span v-if="currentFeed.personaId" class="feed-card__persona-id">{{ currentFeed.personaId }}</span>
            </div>
            <el-tag v-if="currentFeed.archetype" size="small" :type="archetypeColor[currentFeed.archetype] || 'primary'">
              {{ $t('persona.archetypeOptions.' + currentFeed.archetype) }}
            </el-tag>
            <el-tag v-if="currentFeed.toneMode" size="small" effect="plain" class="feed-card__tone-tag">
              {{ toneLabel(currentFeed.toneMode) }}
            </el-tag>
            <el-popover
              trigger="click"
              placement="left-start"
              :width="400"
              @show="currentFeed.personaId && loadPersonaDetail(currentFeed.personaId)"
            >
              <template #reference>
                <el-button size="small" link type="primary" class="feed-card__expand-btn">
                  {{ $t('common.expand') }}
                  <el-icon><ArrowDown /></el-icon>
                </el-button>
              </template>
              <div class="persona-detail">
                <div class="persona-detail__title">{{ $t('feed.persona') }} · {{ currentFeed.personaId }}</div>
                <template v-if="personaCache[currentFeed.personaId]">
                  <div class="persona-detail__grid">
                    <div class="persona-detail__item">
                      <span class="persona-detail__label">{{ $t('persona.archetype') }}</span>
                      <el-tag size="small" :type="archetypeColor[personaCache[currentFeed.personaId].archetype] || 'primary'">
                        {{ $t('persona.archetypeOptions.' + personaCache[currentFeed.personaId].archetype) }}
                      </el-tag>
                    </div>
                    <div class="persona-detail__item">
                      <span class="persona-detail__label">{{ $t('persona.primaryTone') }}</span>
                      <span>{{ toneLabel(personaCache[currentFeed.personaId].primaryToneMode) }}</span>
                    </div>
                    <div class="persona-detail__item">
                      <span class="persona-detail__label">{{ $t('persona.maxPostsPerDay') }}</span>
                      <span>{{ personaCache[currentFeed.personaId].maxPostsPerDay }}</span>
                    </div>
                  </div>
                  <div v-if="personaCache[currentFeed.personaId].voiceCues?.length" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.voiceCues') }}</span>
                    <div class="persona-detail__tags">
                      <el-tag v-for="v in personaCache[currentFeed.personaId].voiceCues" :key="v" size="small" effect="plain">{{ v }}</el-tag>
                    </div>
                  </div>
                  <div v-if="personaCache[currentFeed.personaId].catchphrases?.length" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.catchphrases') }}</span>
                    <div class="persona-detail__tags">
                      <el-tag v-for="c in personaCache[currentFeed.personaId].catchphrases" :key="c" size="small" type="success" effect="plain">{{ c }}</el-tag>
                    </div>
                  </div>
                  <div v-if="personaCache[currentFeed.personaId].tier3Script" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.tier3Script') }}</span>
                    <div class="persona-detail__script">{{ personaCache[currentFeed.personaId].tier3Script }}</div>
                  </div>
                  <div v-if="personaCache[currentFeed.personaId].topicBlacklist?.length" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.topicBlacklist') }}</span>
                    <div class="persona-detail__tags">
                      <el-tag v-for="b in personaCache[currentFeed.personaId].topicBlacklist" :key="b" size="small" type="danger" effect="plain">{{ b }}</el-tag>
                    </div>
                  </div>
                </template>
                <div v-else style="text-align: center; padding: 12px">
                  <el-icon class="is-loading"><RefreshRight /></el-icon>
                </div>
              </div>
            </el-popover>
          </div>
        </div>

        <!-- Footer -->
        <div class="feed-card__footer">
          <div class="feed-card__footer-left">
            <span v-if="currentFeed.charCount" class="feed-card__char-count">{{ $t('feed.charCount', { count: currentFeed.charCount }) }}</span>
          </div>
          <div class="feed-card__footer-right">
            <el-button :disabled="actionLoading" @click="openEdit">{{ $t('common.edit') }}</el-button>
            <el-button type="warning" :loading="regenerateLoading" :disabled="actionLoading" @click="doRegenerate">{{ $t('feed.regenerate') }}</el-button>
            <template v-if="currentFeed.status === 'approved'">
              <!-- 已通过：显示发布按钮 -->
              <el-button type="success" :loading="postLoading" :disabled="actionLoading" @click="doPost">{{ $t('myDashboard.publish') }}</el-button>
              <el-button :disabled="actionLoading" @click="advanceToNext">{{ $t('myDashboard.next') }}</el-button>
            </template>
            <template v-else-if="currentFeed.status === 'failed'">
              <!-- 发布失败：重新通过 + 发布 -->
              <div class="feed-card__fail">{{ currentFeed.failReason }}</div>
              <el-button class="btn-approve" :loading="approveLoading" :disabled="actionLoading" @click="doApprove">{{ $t('myDashboard.reApprove') }}</el-button>
              <el-button :disabled="actionLoading" @click="advanceToNext">{{ $t('myDashboard.next') }}</el-button>
            </template>
            <template v-else>
              <!-- pending：显示审核按钮 -->
              <el-button :loading="skipLoading" :disabled="actionLoading" @click="doSkip">↷ {{ $t('myDashboard.skip') }} (S)</el-button>
              <el-button class="btn-reject" :loading="rejectLoading" :disabled="actionLoading" @click="doReject">✗ {{ $t('myDashboard.reject') }} (K)</el-button>
              <el-button class="btn-approve" :loading="approveLoading" :disabled="actionLoading" @click="doApprove">✓ {{ $t('myDashboard.approve') }} (J)</el-button>
              <el-button type="success" :loading="approveAndPostLoading" :disabled="actionLoading" @click="doApproveAndPost">{{ $t('myDashboard.approveAndPublish') }}</el-button>
            </template>
          </div>
        </div>
      </div>

      <!-- Next preview -->
      <div v-if="feeds[workbenchIndex + 1]" class="workbench-next">
        {{ $t('myDashboard.nextPreview') }}: {{ feeds[workbenchIndex + 1].feedId }} — {{ truncate(feeds[workbenchIndex + 1].threadSubject || feeds[workbenchIndex + 1].subject, 40) }}
      </div>
    </template>

    <!-- Batch complete -->
    <div v-if="workbenchActive && !currentFeed" class="batch-complete">
      <div class="cta-card">
        <div class="batch-complete__icon">🎉</div>
        <div class="batch-complete__text">{{ $t('myDashboard.batchComplete') }}</div>
        <div class="batch-complete__stats">
          {{ $t('myDashboard.batchStats', { count: processedInBatch }) }}
        </div>
        <el-button type="primary" :loading="claiming" class="cta-btn" @click="startReview">
          {{ $t('myDashboard.nextBatch') }}
        </el-button>
      </div>
    </div>

    <!-- Edit modal -->
    <FeedEditModal
      v-model="showEditModal"
      :edit-data="editRow"
      :board-map="boardMap"
      @saved="onEditSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, RefreshRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../../api'
import FeedEditModal from '../feed/FeedEditModal.vue'

const { t } = useI18n()

// --- Page loading ---
const pageLoading = ref(true)

// --- Stats ---
const teamStats = reactive({ totalPending: 0, claimed: 0, unclaimed: 0 })

const loadTeamStats = async () => {
  try {
    const res: any = await api.get('/v1/review-queue/stats', { params: { mine: 'true' } })
    Object.assign(teamStats, res.data || res)
  } catch { /* empty */ }
}

// --- Workbench ---
const feeds = ref<any[]>([])
const workbenchIndex = ref(0)
const processedInBatch = ref(0)
const claiming = ref(false)
const claimExpiresAt = ref<string | null>(null)
const claimedTotal = ref(0)
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

const workbenchActive = computed(() => feeds.value.length > 0 || processedInBatch.value > 0)
const currentFeed = computed(() => feeds.value[workbenchIndex.value] || null)

const ttlDisplay = computed(() => {
  if (!claimExpiresAt.value) return ''
  const diff = Math.max(0, Math.floor((new Date(claimExpiresAt.value).getTime() - Date.now()) / 60000))
  return t('myDashboard.ttlRemaining', { min: diff })
})

// Board map
const boardMap = ref<Record<number, string>>({})
const loadBoards = async () => {
  try {
    const res: any = await api.get('/v1/forums')
    const tree = res.data || res
    const map: Record<number, string> = {}
    for (const cat of tree) {
      for (const b of (cat.boards || [])) { map[b.fid] = b.name }
    }
    boardMap.value = map
  } catch { /* ignore */ }
}
const boardName = (fid: number | undefined): string => fid ? (boardMap.value[fid] || `fid:${fid}`) : '-'

// --- Persona & Tone ---
const personaCache = ref<Record<string, any>>({})
const tones = ref<{ toneId: string; displayName: string }[]>([])

const loadPersonaDetail = async (accountId: string) => {
  if (!accountId || personaCache.value[accountId]) return
  try {
    const res = await api.get(`/v1/personas/${accountId}`)
    personaCache.value = { ...personaCache.value, [accountId]: res.data || res }
  } catch { /* ignore */ }
}

const loadTones = async () => {
  if (tones.value.length > 0) return
  try {
    const res = await api.get('/v1/tones')
    tones.value = (res.data || res).map((t: any) => ({ toneId: t.toneId, displayName: t.displayName }))
  } catch { /* ignore */ }
}

const toneLabel = (toneId: string): string => {
  const tone = tones.value.find(t => t.toneId === toneId)
  return tone ? tone.displayName : toneId || '-'
}

const archetypeColor: Record<string, string> = {
  pregnant: 'danger',
  'first-time-mom': '',
  'multi-kid': 'success',
  'school-age': 'warning',
}

// --- Edit & Regenerate ---
const showEditModal = ref(false)
const editRow = ref<Record<string, any> | null>(null)
const regenerateLoading = ref(false)
const approveLoading = ref(false)
const rejectLoading = ref(false)
const skipLoading = ref(false)
const postLoading = ref(false)
const approveAndPostLoading = ref(false)
const actionLoading = computed(() => regenerateLoading.value || approveLoading.value || rejectLoading.value || skipLoading.value || postLoading.value || approveAndPostLoading.value)

const openEdit = () => {
  if (!currentFeed.value) return
  editRow.value = { ...currentFeed.value }
  showEditModal.value = true
}

const onEditSaved = async () => {
  // Refresh current feed data
  if (!currentFeed.value) return
  try {
    const res = await api.get(`/v1/feeds/${currentFeed.value.feedId}`)
    const updated = res.data || res
    feeds.value[workbenchIndex.value] = updated
    feeds.value = [...feeds.value]
  } catch { /* ignore */ }
}

const doRegenerate = async () => {
  if (!currentFeed.value) return
  regenerateLoading.value = true
  try {
    await api.post(`/v1/feeds/${currentFeed.value.feedId}/regenerate`)
    ElMessage.success(t('feed.regenerate'))
    const res = await api.get(`/v1/feeds/${currentFeed.value.feedId}`)
    const updated = res.data || res
    feeds.value[workbenchIndex.value] = updated
    feeds.value = [...feeds.value]
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  } finally {
    regenerateLoading.value = false
  }
}

const startReview = async () => {
  claiming.value = true
  try {
    const res: any = await api.post('/v1/review-queue/claim-batch', { count: 10 })
    const data = res.data || res
    if (!data.claimed || data.claimed.length === 0) {
      ElMessage.info(t('myDashboard.workbenchEmpty'))
      return
    }
    feeds.value = data.claimed
    claimedTotal.value = data.claimed.length
    workbenchIndex.value = 0
    processedInBatch.value = 0
    claimExpiresAt.value = data.claimExpiresAt
    startHeartbeat()
    loadTeamStats()
    window.dispatchEvent(new Event('refresh-queue-stats'))
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    claiming.value = false
  }
}

const advance = () => {
  feeds.value.splice(workbenchIndex.value, 1)
  processedInBatch.value++
  window.dispatchEvent(new Event('refresh-queue-stats'))
  if (feeds.value.length === 0) {
    // Batch complete
    stopHeartbeat()
    loadTeamStats()
    return
  }
  if (workbenchIndex.value >= feeds.value.length) {
    workbenchIndex.value = feeds.value.length - 1
  }
}

const doApprove = async () => {
  const feed = currentFeed.value
  if (!feed) return
  approveLoading.value = true
  try {
    await api.post(`/v1/review-queue/${feed.id}/approve`)
    ElMessage.success(t('myDashboard.approved'))
    // 通过后保留在工作台，状态变为 approved
    feeds.value[workbenchIndex.value] = { ...feed, status: 'approved' }
    feeds.value = [...feeds.value]
    window.dispatchEvent(new Event('refresh-queue-stats'))
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    approveLoading.value = false
  }
}

const doReject = async () => {
  const feed = currentFeed.value
  if (!feed) return
  try {
    const { value: notes } = await ElMessageBox.prompt(t('feed.rejectNotesPrompt'), t('myDashboard.reject'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputType: 'textarea',
    })
    rejectLoading.value = true
    await api.post(`/v1/review-queue/${feed.id}/reject`, { notes })
    ElMessage.success(t('myDashboard.rejected'))
    advance()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    rejectLoading.value = false
  }
}

const doSkip = async () => {
  const feed = currentFeed.value
  if (!feed) return
  skipLoading.value = true
  try {
    await api.post(`/v1/review-queue/${feed.id}/skip`)
    advance()
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    skipLoading.value = false
  }
}

const doPost = async () => {
  const feed = currentFeed.value
  if (!feed) return
  postLoading.value = true
  try {
    await api.post(`/v1/poster/${feed.id}/post`)
    ElMessage.success(t('myDashboard.posted'))
    advance()
  } catch (err: any) {
    const msg = err.error?.message || err.message || t('common.error')
    ElMessage.error(msg)
    // 发布失败，更新本地状态
    feeds.value[workbenchIndex.value] = { ...feed, status: 'failed', failReason: msg }
    feeds.value = [...feeds.value]
  } finally {
    postLoading.value = false
  }
}

const doApproveAndPost = async () => {
  const feed = currentFeed.value
  if (!feed) return
  approveAndPostLoading.value = true
  try {
    await api.post(`/v1/review-queue/${feed.id}/approve`)
    try {
      await api.post(`/v1/poster/${feed.id}/post`)
      ElMessage.success(t('myDashboard.posted'))
      advance()
    } catch (postErr: any) {
      const msg = postErr.error?.message || postErr.message || t('common.error')
      ElMessage.error(msg)
      feeds.value[workbenchIndex.value] = { ...feed, status: 'failed', failReason: msg }
      feeds.value = [...feeds.value]
    }
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  } finally {
    approveAndPostLoading.value = false
  }
}

const advanceToNext = () => {
  advance()
}

const exitWorkbench = async () => {
  // 将未处理的 pending feeds 释放回池
  try {
    await api.post('/v1/review-queue/release-claims')
  } catch { /* ignore */ }
  feeds.value = []
  workbenchIndex.value = 0
  processedInBatch.value = 0
  claimedTotal.value = 0
  claimExpiresAt.value = null
  stopHeartbeat()
  await loadTeamStats()
  // 通知 header 刷新统计
  window.dispatchEvent(new Event('refresh-queue-stats'))
}

const startHeartbeat = () => {
  stopHeartbeat()
  heartbeatTimer = setInterval(async () => {
    try { await api.post('/v1/review-queue/extend-claims') } catch { /* ignore */ }
  }, 5 * 60 * 1000)
}
const stopHeartbeat = () => {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

// --- Helpers ---
const normSources = (feed: any): string[] => {
  const src = feed.source || feed.sources
  return Array.isArray(src) ? src : src ? [src] : []
}
const truncate = (str: string | undefined, len: number): string => {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}
const formatTime = (d: string | undefined): string => d ? new Date(d).toLocaleString() : ''
const avatarInitial = (name: string): string => name ? name.charAt(0).toUpperCase() : '?'

// --- Keyboard ---
const handleKeydown = (e: KeyboardEvent) => {
  if (!currentFeed.value) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  switch (e.key.toLowerCase()) {
    case 'j': e.preventDefault(); doApprove(); break
    case 'k': e.preventDefault(); doReject(); break
    case 's': e.preventDefault(); doSkip(); break
    case 'o':
      e.preventDefault()
      if (currentFeed.value.threadTid) {
        window.open(`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${currentFeed.value.threadTid}`, '_blank')
      }
      break
  }
}

onMounted(async () => {
  await Promise.all([loadTeamStats(), loadBoards(), loadTones()])

  // Restore existing workbench
  try {
    const res: any = await api.get('/v1/review-queue/my-workbench')
    const data = res.data || res
    if (data.feeds && data.feeds.length > 0) {
      feeds.value = data.feeds
      claimedTotal.value = data.feeds.length
      workbenchIndex.value = 0
      processedInBatch.value = 0
      claimExpiresAt.value = data.claimExpiresAt
      startHeartbeat()
    }
  } catch { /* ignore */ }

  pageLoading.value = false
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  stopHeartbeat()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.my-dashboard .page-title { margin-bottom: 20px; }

/* CTA */
.cta-wrapper {
  display: flex; justify-content: center; padding: 60px 0;
}
.cta-card {
  background: var(--bk-card); border: 1px solid var(--bk-border); border-radius: 16px;
  padding: 40px 48px; display: flex; flex-direction: column; align-items: center; gap: 28px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04); min-width: 360px;
}
.cta-card__stats {
  display: flex; align-items: center; gap: 32px;
}
.cta-stat {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.cta-stat__value {
  font-size: 36px; font-weight: 700; color: var(--el-color-primary);
  font-variant-numeric: tabular-nums; line-height: 1;
}
.cta-stat__value--claimed {
  color: var(--el-color-success);
}
.cta-stat__label {
  font-size: 13px; color: var(--bk-muted-fg);
}
.cta-stat-divider {
  width: 1px; height: 40px; background: var(--bk-border);
}
.cta-btn {
  height: 48px; min-width: 200px; font-size: 16px; font-weight: 600;
  border-radius: 10px; letter-spacing: 0.5px;
}

/* Workbench bar */
.workbench-bar {
  display: flex; align-items: center; gap: 16px; margin: 20px 0 12px;
  padding: 10px 16px; background: var(--bk-muted); border-radius: var(--bk-radius-sm);
}
.workbench-progress { font-size: 15px; font-weight: 600; color: var(--bk-foreground); }
.workbench-ttl { font-size: 13px; color: var(--bk-muted-fg); flex: 1; }

/* Feed card */
.feed-card {
  background: var(--bk-card); border: 1px solid var(--bk-border); border-radius: var(--bk-radius);
  padding: 20px; transition: box-shadow 0.2s;
}
.feed-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.feed-card__header-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.feed-card__header-right { display: flex; align-items: center; gap: 4px; }
.feed-id-chip { font-size: 12px; background: var(--bk-muted); padding: 2px 8px; border-radius: 4px; font-family: 'SF Mono', 'Fira Code', monospace; color: var(--bk-muted-fg); }
.feed-card__time { font-size: 12px; color: var(--bk-muted-fg); }
.feed-card__meta { font-size: 12px; color: var(--bk-muted-fg); }

.feed-card__body { display: flex; gap: 16px; margin-bottom: 12px; }
.feed-card__content { flex: 2; min-width: 0; }
.feed-card__subject { font-size: 14px; font-weight: 600; color: var(--bk-foreground); margin-bottom: 8px; line-height: 1.5; }
.feed-card__view-thread { font-size: 12px; font-weight: 400; color: var(--el-color-primary); margin-left: 8px; text-decoration: none; }
.feed-card__view-thread:hover { text-decoration: underline; }
.feed-card__trend-summary { font-size: 13px; color: var(--bk-muted-fg); margin-bottom: 8px; line-height: 1.5; }
.feed-card__preview { font-size: 13px; color: var(--bk-muted-fg); margin-bottom: 8px; line-height: 1.6; }
.feed-card__preview-label { font-size: 11px; color: var(--el-text-color-secondary); display: block; margin-bottom: 4px; }
.feed-card__preview {
  font-size: 13px; color: var(--el-text-color-regular); margin-bottom: 8px;
  background: #F9FAFB; border: 1px solid var(--bk-border); border-radius: var(--bk-radius-sm);
  padding: 8px 10px; line-height: 1.6; white-space: pre-wrap;
}
.feed-card__preview-label {
  font-size: 11px; font-weight: 600; color: var(--el-color-primary); margin-right: 6px;
}
.feed-card__original { margin-bottom: 12px; }
.feed-card__original-label {
  font-size: 12px; font-weight: 600; color: var(--bk-muted-fg); margin-bottom: 6px; display: block;
}
.feed-card__original-box {
  background: var(--bk-muted); padding: 12px; border-radius: 6px;
  font-size: 13px; line-height: 1.7; white-space: pre-wrap; color: var(--bk-foreground);
  max-height: 200px; overflow-y: auto; border-left: 3px solid var(--bk-border);
}
.feed-card__generated-label {
  font-size: 12px; font-weight: 600; color: var(--el-color-primary); margin-bottom: 6px;
}
.feed-card__draft-box {
  background: #F9FAFB; border: 1px solid var(--bk-border); border-radius: var(--bk-radius-sm);
  padding: 8px 12px; font-size: 13px; color: var(--bk-muted-fg);
  line-height: 1.6; white-space: pre-wrap; max-height: 400px; overflow-y: auto;
}

.feed-card__persona {
  flex: 1; background: #EFF6FF; border-radius: var(--bk-radius-sm); padding: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 140px;
}
.feed-card__avatar { width: 40px; height: 40px; font-size: 16px; }
.feed-card__persona-name { font-weight: 600; font-size: 13px; text-align: center; }
.feed-card__persona-id { display: block; font-size: 11px; font-weight: 400; color: #909399; }
.feed-card__tone-tag { margin-top: 2px; }
.feed-card__expand-btn { margin-top: 4px; font-size: 12px; }

/* Persona detail popover */
.persona-detail { background: #F0F9FF; border-radius: var(--bk-radius-sm); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.persona-detail__title { font-weight: 600; font-size: 13px; color: var(--el-color-primary); }
.persona-detail__grid { display: flex; flex-wrap: wrap; gap: 12px 24px; }
.persona-detail__item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.persona-detail__block { display: flex; flex-direction: column; gap: 4px; }
.persona-detail__label { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); }
.persona-detail__tags { display: flex; flex-wrap: wrap; gap: 4px; }
.persona-detail__script { font-size: 12px; color: var(--el-text-color-regular); line-height: 1.6; background: #fff; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--bk-border); }

.feed-card__footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--bk-border);
}
.feed-card__fail {
  font-size: 12px; color: var(--el-color-danger);
  border: 1px solid var(--el-color-danger-light-5); border-radius: var(--bk-radius-sm);
  padding: 6px 10px; line-height: 1.5; word-break: break-all; margin-bottom: 8px;
}
.feed-card__footer-left { display: flex; align-items: center; gap: 8px; }
.feed-card__footer-right { display: flex; align-items: center; gap: 8px; }
.feed-card__char-count { font-size: 12px; color: var(--bk-muted-fg); }

.btn-approve {
  --el-button-bg-color: var(--el-color-success-light-9); --el-button-text-color: var(--el-color-success);
  --el-button-border-color: var(--el-color-success-light-5); --el-button-hover-bg-color: var(--el-color-success-light-7);
  --el-button-hover-text-color: var(--el-color-success); --el-button-hover-border-color: var(--el-color-success);
}
.btn-reject {
  --el-button-bg-color: var(--el-color-danger-light-9); --el-button-text-color: var(--el-color-danger);
  --el-button-border-color: var(--el-color-danger-light-5); --el-button-hover-bg-color: var(--el-color-danger-light-7);
  --el-button-hover-text-color: var(--el-color-danger); --el-button-hover-border-color: var(--el-color-danger);
}

/* Next preview */
.workbench-next {
  margin-top: 12px; padding: 8px 16px; font-size: 13px; color: var(--bk-muted-fg);
  background: var(--bk-muted); border-radius: var(--bk-radius-sm); text-align: center;
}

/* Batch complete */
.batch-complete {
  display: flex; justify-content: center; padding: 60px 0;
}
.batch-complete > * {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
}
.batch-complete__icon { font-size: 48px; }
.batch-complete__text { font-size: 18px; font-weight: 600; color: var(--bk-foreground); }
.batch-complete__stats { font-size: 14px; color: var(--bk-muted-fg); margin-bottom: 8px; }
</style>
