<template>
  <div class="feed-view">
    <!-- Sticky top bar -->
    <div class="feed-sticky-top">
      <div class="feed-header">
        <h2 class="page-title">{{ $t('feed.title') }}</h2>
        <div v-if="feedStore.newFeedCount > 0" class="new-feed-badge" @click="refreshNewFeeds">
          <el-icon :size="14"><RefreshRight /></el-icon>
          <span>{{ feedStore.newFeedCount }} {{ $t('feed.newFeeds') }}</span>
        </div>
        <div class="toolbar">
          <el-button type="primary" @click="showCustomGenerate = true">
            {{ $t('feed.customGenerate') }}
          </el-button>
          <el-button
            type="success"
            :disabled="!selectedIds.size"
            @click="batchApprove"
          >
            {{ $t('feed.batchApprove') }} ({{ selectedIds.size }})
          </el-button>
          <el-button
            type="danger"
            :disabled="!selectedIds.size"
            @click="batchReject"
          >
            {{ $t('feed.batchReject') }} ({{ selectedIds.size }})
          </el-button>
        </div>
      </div>

      <!-- Status Tabs -->
      <el-tabs v-model="activeTab" @tab-change="onTabChange" class="feed-tabs">
        <el-tab-pane name="pending">
          <template #label>
            {{ $t('feed.tabs.pending') }}
            <el-badge
              v-if="pendingCount > 0"
              :value="pendingCount"
              :max="99"
              class="tab-badge"
            />
          </template>
        </el-tab-pane>
        <el-tab-pane :label="$t('feed.tabs.approved')" name="approved" />
        <el-tab-pane :label="$t('feed.tabs.posted')" name="posted" />
        <el-tab-pane :label="$t('feed.tabs.rejected')" name="rejected" />
        <el-tab-pane :label="$t('feed.tabs.failed')" name="failed" />
      </el-tabs>

      <!-- Quick filter chips -->
      <div class="filter-chips">
        <el-tag
          v-for="src in ['bk-forum', 'google-trends', 'medialens', 'custom']"
          :key="src"
          :type="feedStore.filters.source === src ? 'primary' : 'info'"
          :effect="feedStore.filters.source === src ? 'dark' : 'plain'"
          class="filter-chip"
          @click="toggleSourceFilter(src)"
        >
          {{ $t(`feed.sources.${src}`) }}
        </el-tag>
        <el-tag
          v-if="feedStore.filters.source"
          type="info"
          effect="plain"
          class="filter-chip"
          @click="clearSourceFilter"
        >
          {{ $t('common.clearFilter') }}
        </el-tag>
      </div>
    </div>

    <!-- Feed Cards (scrollable) -->
    <div v-loading="feedStore.loading" class="feed-cards">
      <div
        v-for="feed in feedStore.feeds"
        :key="feed._id"
        class="feed-card hover-lift"
        :class="[
          tierBorderClass(feed.sensitivityTier),
          { 'feed-card--claimed-mine': isClaimedByMe(feed) },
          { 'feed-card--claimed-other': isClaimedByOther(feed) },
        ]"
      >
        <!-- Card Header -->
        <div class="feed-card__header">
          <div class="feed-card__header-left">
            <el-checkbox
              :model-value="selectedIds.has(feed.feedId)"
              @change="(val: boolean) => toggleSelect(feed.feedId, val)"
            />
            <code class="feed-id-chip">{{ feed.feedId }}</code>
            <span class="feed-card__time">{{ formatTime(feed.createdAt) }}</span>
            <span v-if="feed.trendSummary || feed.threadTid" class="feed-card__meta">
              {{ feed.trendSummary || `${feed.source === 'scanner' ? 'BK 論壇掃描' : feed.source === 'trends' ? '趨勢話題' : '自訂生成'} · tid:${feed.threadTid || '-'} · fid:${feed.threadFid || '-'}` }}
            </span>
          </div>
          <div class="feed-card__header-right">
            <el-tag :type="statusType(feed.status)" size="small">{{ feed.status }}</el-tag>
            <el-tag size="small" effect="plain">{{ feed.source }}</el-tag>
          </div>
        </div>

        <!-- Card Body -->
        <div class="feed-card__body">
          <!-- Left: Content -->
          <div class="feed-card__content">
            <div class="feed-card__subject">
              {{ feed.threadSubject }}
              <a
                v-if="feed.threadTid"
                class="feed-card__view-thread"
                :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${feed.threadTid}`"
                target="_blank"
                rel="noopener"
                @click.stop
              >{{ $t('feed.viewThread') }} ↗</a>
            </div>
            <div v-if="feed.draftContent" class="feed-card__preview">
              <span class="feed-card__preview-label">{{ $t('feed.replyContent') }}</span>
              {{ truncate(feed.draftContent, 160) }}
            </div>
            <div v-if="feed.finalContent" class="feed-card__draft-box">
              {{ truncate(feed.finalContent, 200) }}
            </div>
          </div>
          <!-- Right: Persona Info -->
          <div v-if="feed.bkUsername" class="feed-card__persona">
            <div class="avatar-gradient feed-card__avatar">
              {{ avatarInitial(feed.bkUsername) }}
            </div>
            <div class="feed-card__persona-name">{{ feed.bkUsername }}</div>
            <el-tag v-if="feed.archetype" size="small" :type="archetypeColor[feed.archetype] || 'primary'">
              {{ $t('persona.archetypeOptions.' + feed.archetype) }}
            </el-tag>
            <el-tag v-if="feed.toneMode" size="small" effect="plain" class="feed-card__tone-tag">
              {{ toneLabel(feed.toneMode) }}
            </el-tag>
            <el-popover
              trigger="click"
              placement="left-start"
              :width="400"
              @show="feed.personaId && loadPersonaDetail(feed.personaId)"
            >
              <template #reference>
                <el-button size="small" link type="primary" class="feed-card__expand-btn">
                  {{ $t('common.expand') }}
                  <el-icon><ArrowDown /></el-icon>
                </el-button>
              </template>

              <!-- Popover content -->
              <div class="persona-detail">
                <div class="persona-detail__title">{{ $t('feed.persona') }} · {{ feed.personaId }}</div>

                <template v-if="personaCache[feed.personaId]">
                  <div class="persona-detail__grid">
                    <div class="persona-detail__item">
                      <span class="persona-detail__label">{{ $t('persona.archetype') }}</span>
                      <el-tag size="small" :type="archetypeColor[personaCache[feed.personaId].archetype] || 'primary'">
                        {{ $t('persona.archetypeOptions.' + personaCache[feed.personaId].archetype) }}
                      </el-tag>
                    </div>
                    <div class="persona-detail__item">
                      <span class="persona-detail__label">{{ $t('persona.primaryTone') }}</span>
                      <span>{{ toneLabel(personaCache[feed.personaId].primaryToneMode) }}</span>
                    </div>
                    <div class="persona-detail__item">
                      <span class="persona-detail__label">{{ $t('persona.maxPostsPerDay') }}</span>
                      <span>{{ personaCache[feed.personaId].maxPostsPerDay }}</span>
                    </div>
                  </div>
                  <div v-if="personaCache[feed.personaId].voiceCues?.length" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.voiceCues') }}</span>
                    <div class="persona-detail__tags">
                      <el-tag v-for="v in personaCache[feed.personaId].voiceCues" :key="v" size="small" effect="plain">{{ v }}</el-tag>
                    </div>
                  </div>
                  <div v-if="personaCache[feed.personaId].catchphrases?.length" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.catchphrases') }}</span>
                    <div class="persona-detail__tags">
                      <el-tag v-for="c in personaCache[feed.personaId].catchphrases" :key="c" size="small" type="success" effect="plain">{{ c }}</el-tag>
                    </div>
                  </div>
                  <div v-if="personaCache[feed.personaId].tier3Script" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.tier3Script') }}</span>
                    <div class="persona-detail__script">{{ personaCache[feed.personaId].tier3Script }}</div>
                  </div>
                  <div v-if="personaCache[feed.personaId].topicBlacklist?.length" class="persona-detail__block">
                    <span class="persona-detail__label">{{ $t('persona.topicBlacklist') }}</span>
                    <div class="persona-detail__tags">
                      <el-tag v-for="b in personaCache[feed.personaId].topicBlacklist" :key="b" size="small" type="danger" effect="plain">{{ b }}</el-tag>
                    </div>
                  </div>
                </template>
                <div v-else style="text-align: center; padding: 12px">
                  <el-icon class="is-loading"><RefreshRight /></el-icon>
                </div>

                <!-- Feed meta -->
                <div class="feed-detail__meta">
                  <span v-if="feed.sensitivityTier"><el-tag :type="tierTagType(feed.sensitivityTier)" size="small">{{ feed.sensitivityTier }}</el-tag></span>
                  <span v-if="feed.postType" class="feed-detail__chip">{{ feed.postType }}</span>
                  <span v-if="feed.relevanceScore != null" class="feed-detail__chip">{{ $t('feed.relevanceScore') }}: {{ feed.relevanceScore }}</span>
                  <span v-if="feed.trendSentiment != null" class="feed-detail__chip">{{ $t('feed.trendSentiment') }}: {{ feed.trendSentiment }}</span>
                </div>
                <div v-if="feed.failReason" class="feed-detail__fail">{{ feed.failReason }}</div>
                <div v-if="feed.adminNotes" class="feed-detail__notes">{{ $t('feed.adminNotes') }}: {{ feed.adminNotes }}</div>
              </div>
            </el-popover>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="feed-card__footer">
          <div class="feed-card__footer-left">
            <!-- Claim / Release -->
            <template v-if="!feed.claimedBy">
              <el-button size="small" type="warning" @click="claim(feed)">
                <el-icon><Lock /></el-icon>
                {{ $t('feed.claim') }}
              </el-button>
            </template>
            <template v-else-if="isClaimedByMe(feed)">
              <el-button size="small" type="info" @click="unclaim(feed)">
                <el-icon><Unlock /></el-icon>
                {{ $t('feed.unclaim') }}
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" type="info" disabled>
                <el-icon><Lock /></el-icon>
                {{ feed.claimedBy }}
              </el-button>
            </template>

            <span v-if="feed.charCount" class="feed-card__char-count">
              {{ $t('feed.charCount', { count: feed.charCount }) }}
            </span>
          </div>
          <div class="feed-card__footer-right">
            <el-button size="small" @click="openEdit(feed)" :disabled="isClaimedByOther(feed)">
              {{ $t('common.edit') }}
            </el-button>
            <el-button size="small" type="warning" @click="regenerate(feed)" :disabled="isClaimedByOther(feed)">
              {{ $t('feed.regenerate') }}
            </el-button>
            <el-button
              v-if="feed.status !== 'rejected'"
              size="small"
              class="btn-reject"
              @click="rejectWithNotes(feed)"
              :disabled="isClaimedByOther(feed)"
            >
              {{ $t('feed.reject') }}
            </el-button>
            <el-button
              v-if="feed.status !== 'approved'"
              size="small"
              class="btn-approve"
              @click="approve(feed)"
              :disabled="isClaimedByOther(feed)"
            >
              {{ $t('feed.approve') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <el-empty v-if="!feedStore.loading && !feedStore.feeds.length" />
    </div>

    <!-- Pagination -->
    <el-pagination
      v-if="feedStore.pagination.pages > 1"
      class="feed-pagination"
      layout="prev, pager, next"
      :total="feedStore.pagination.total"
      :page-size="feedStore.pagination.limit"
      :current-page="feedStore.pagination.page"
      @current-change="onPageChange"
    />

    <!-- Modals -->
    <FeedEditModal
      v-model="showEditModal"
      :edit-data="editRow"
      @saved="onFeedSaved"
    />

    <CustomGenerateModal
      v-model="showCustomGenerate"
      @saved="onFeedSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, Unlock, RefreshRight, ArrowDown } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../../api'
import { useFeedStore } from '../../stores/feed'
import { useAuthStore } from '../../stores/auth'
import FeedEditModal from './FeedEditModal.vue'
import CustomGenerateModal from './CustomGenerateModal.vue'

const { t } = useI18n()
const feedStore = useFeedStore()
const authStore = useAuthStore()

const activeTab = ref<string>('pending')
const selectedIds = ref<Set<string>>(new Set())
const showEditModal = ref<boolean>(false)
const editRow = ref<Record<string, any> | null>(null)
const showCustomGenerate = ref<boolean>(false)
const pendingCount = ref<number>(0)
const tones = ref<{ toneId: string; displayName: string }[]>([])
const personaCache = ref<Record<string, any>>({})

const loadPersonaDetail = async (accountId: string) => {
  if (!accountId || personaCache.value[accountId]) return
  try {
    const res = await api.get(`/v1/personas/${accountId}`)
    const data = res.data || res
    personaCache.value = { ...personaCache.value, [accountId]: data }
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
  const t = tones.value.find(t => t.toneId === toneId)
  return t ? `${t.displayName}` : toneId || '-'
}

const tierTagType = (tier: string | number | undefined): string => {
  if (!tier) return 'info'
  const s = String(tier)
  if (s.includes('3')) return 'danger'
  if (s.includes('2')) return 'warning'
  return 'success'
}

const archetypeColor: Record<string, string> = {
  pregnant: 'danger',
  'first-time-mom': '',
  'multi-kid': 'success',
  'school-age': 'warning',
}

const statusType = (status: string): string => {
  const map: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    posted: 'info',
    failed: 'danger',
  }
  return map[status] || ''
}

const tierBorderClass = (tier: number | string | undefined): string => {
  if (tier === 1 || tier === 'tier1') return 'border-tier-1'
  if (tier === 2 || tier === 'tier2') return 'border-tier-2'
  if (tier === 3 || tier === 'tier3') return 'border-tier-3'
  return 'border-tier-1'
}

const truncate = (str: string | undefined, len: number): string => {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

const formatTime = (d: string | undefined): string => {
  if (!d) return ''
  return new Date(d).toLocaleString()
}

const avatarInitial = (name: string): string => {
  return name ? name.charAt(0).toUpperCase() : '?'
}

const isClaimedByMe = (feed: any): boolean => {
  return !!feed.claimedBy && feed.claimedBy === authStore.user?.username
}

const isClaimedByOther = (feed: any): boolean => {
  if (!feed.claimedBy) return false
  const myId = authStore.user?._id || authStore.user?.id
  return feed.claimedBy !== myId
}

const toggleSelect = (feedId: string, checked: boolean) => {
  const copy = new Set(selectedIds.value)
  if (checked) {
    copy.add(feedId)
  } else {
    copy.delete(feedId)
  }
  selectedIds.value = copy
}

const loadFeeds = async () => {
  await feedStore.fetchFeeds()
}

const loadPendingCount = async () => {
  try {
    const res = await api.get('/v1/feeds', { params: { status: 'pending', limit: 1 } })
    pendingCount.value = (res as any).pagination?.total ?? 0
  } catch {
    // ignore
  }
}

const onTabChange = (tab: string) => {
  feedStore.setFilter('status', tab)
  selectedIds.value = new Set()
  loadFeeds()
}

const toggleSourceFilter = (src: string) => {
  if (feedStore.filters.source === src) {
    feedStore.setFilter('source', '')
  } else {
    feedStore.setFilter('source', src)
  }
  loadFeeds()
}

const clearSourceFilter = () => {
  feedStore.setFilter('source', '')
  loadFeeds()
}

const onPageChange = (page: number) => {
  feedStore.setPage(page)
  loadFeeds()
}

const refreshNewFeeds = () => {
  feedStore.clearNewCount()
  loadFeeds()
}

const openEdit = (row: any) => {
  editRow.value = { ...row }
  showEditModal.value = true
}

const onFeedSaved = () => {
  loadFeeds()
  loadPendingCount()
}

const claim = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/claim`)
    ElMessage.success(t('feed.claim'))
    loadFeeds()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const unclaim = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/unclaim`)
    ElMessage.success(t('feed.unclaim'))
    loadFeeds()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const approve = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/approve`)
    ElMessage.success(t('feed.approve'))
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const rejectWithNotes = async (row: any) => {
  try {
    const { value: notes } = await ElMessageBox.prompt(
      t('feed.placeholder.notes'),
      t('feed.reject'),
      {
        confirmButtonText: t('feed.reject'),
        cancelButtonText: t('common.cancel'),
        inputType: 'textarea',
        inputPlaceholder: t('feed.placeholder.notes'),
      }
    )
    await api.post(`/v1/feeds/${row.feedId}/reject`, { notes: notes || '' })
    ElMessage.success(t('feed.reject'))
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const regenerate = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/regenerate`)
    ElMessage.success(t('feed.regenerate'))
    loadFeeds()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const batchApprove = async () => {
  const ids = Array.from(selectedIds.value)
  if (!ids.length) return
  try {
    await api.post('/v1/feeds/batch/approve', { feedIds: ids })
    ElMessage.success(`${ids.length} ${t('feed.approve')}`)
    selectedIds.value = new Set()
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const batchReject = async () => {
  const ids = Array.from(selectedIds.value)
  if (!ids.length) return
  try {
    const { value: notes } = await ElMessageBox.prompt(
      t('feed.placeholder.notes'),
      t('feed.batchReject'),
      {
        confirmButtonText: t('feed.reject'),
        cancelButtonText: t('common.cancel'),
        inputType: 'textarea',
        inputPlaceholder: t('feed.placeholder.notes'),
      }
    )
    await api.post('/v1/feeds/batch/reject', { feedIds: ids, notes: notes || '' })
    ElMessage.success(`${ids.length} ${t('feed.reject')}`)
    selectedIds.value = new Set()
    loadFeeds()
    loadPendingCount()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

onMounted(() => {
  feedStore.setFilter('status', 'pending')
  loadFeeds()
  loadPendingCount()
  loadTones()
})
</script>

<style scoped>
.feed-view {
}

/* Sticky top area */
.feed-sticky-top {
  position: sticky;
  top: -24px; /* offset the main-content padding so it sticks flush to top */
  z-index: 10;
  background: var(--bk-background);
  padding-top: 24px; /* restore visual spacing eaten by negative top */
  padding-bottom: 12px;
  margin: -24px -24px 0 -24px; /* bleed into main-content padding to cover full width */
  padding-left: 24px;
  padding-right: 24px;
}

/* Feed Header */
.feed-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.new-feed-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--bk-primary);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--bk-transition);
}
.new-feed-badge:hover {
  background: var(--bk-primary-hover);
}

/* Toolbar */
.toolbar {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Tabs */
.feed-tabs {
  margin-bottom: 0;
}
.feed-tabs :deep(.el-tabs__content) {
  display: none; /* tabs are only used for navigation, content is below */
}

/* Filter chips */
.filter-chips {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  flex-wrap: wrap;
}
.filter-chip {
  cursor: pointer;
}

/* Tab badge */
.tab-badge {
  margin-left: 6px;
}

/* Feed Cards Container */
.feed-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

/* Individual Feed Card */
.feed-card {
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  padding: 16px;
  box-shadow: var(--bk-shadow-sm);
}
.feed-card--claimed-mine {
  background: #FEFCE8;
  border-color: #FDE047;
}
.feed-card--claimed-other {
  opacity: 0.75;
}

/* Card Header */
.feed-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.feed-card__header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.feed-card__header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.feed-id-chip {
  background: #F3F4F6;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: var(--bk-muted-fg);
}
.feed-card__time {
  font-size: 12px;
  color: var(--bk-muted-fg);
}

/* Card Body */
.feed-card__body {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.feed-card__content {
  flex: 2;
  min-width: 0;
}
.feed-card__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.3px;
}
.feed-card__subject {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 4px;
  color: var(--bk-foreground);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.feed-card__view-thread {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-color-primary);
  text-decoration: none;
  white-space: nowrap;
}
.feed-card__view-thread:hover {
  text-decoration: underline;
}
.feed-card__preview {
  font-size: 13px;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
  background: #F9FAFB;
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  padding: 8px 10px;
  line-height: 1.6;
}
.feed-card__preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin-right: 6px;
}
.feed-card__draft-box {
  background: #F9FAFB;
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--bk-muted-fg);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Persona Info */
.feed-card__persona {
  flex: 1;
  background: #EFF6FF;
  border-radius: var(--bk-radius-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 140px;
}
.feed-card__avatar {
  width: 40px;
  height: 40px;
  font-size: 16px;
}
.feed-card__persona-name {
  font-weight: 600;
  font-size: 13px;
  text-align: center;
}
.feed-card__tone-tag {
  margin-top: 2px;
}
.feed-card__expand-btn {
  margin-top: 4px;
  font-size: 12px;
}
/* Persona detail (popover) */
.persona-detail {
  background: #F0F9FF;
  border-radius: var(--bk-radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.persona-detail__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-color-primary);
}
.persona-detail__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}
.persona-detail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.persona-detail__block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.persona-detail__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.persona-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.persona-detail__script {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  background: #fff;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid var(--bk-border);
}
/* Feed meta chips */
.feed-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.feed-detail__chip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 10px;
}
.feed-detail__warnings {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.feed-detail__fail {
  font-size: 12px;
  color: var(--el-color-danger);
}
.feed-detail__notes {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-style: italic;
}

/* Card Footer */
.feed-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--bk-border);
  padding-top: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.feed-card__footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.feed-card__footer-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.feed-card__char-count {
  font-size: 12px;
  color: var(--bk-muted-fg);
}

/* Approve / Reject buttons */
.btn-approve {
  background: #22C55E !important;
  border-color: #22C55E !important;
  color: #fff !important;
}
.btn-approve:hover {
  background: #16A34A !important;
  border-color: #16A34A !important;
}
.btn-approve:disabled {
  background: #BBF7D0 !important;
  border-color: #BBF7D0 !important;
  color: #fff !important;
}
.btn-reject {
  background: var(--bk-danger) !important;
  border-color: var(--bk-danger) !important;
  color: #fff !important;
}
.btn-reject:hover {
  background: #B91C1C !important;
  border-color: #B91C1C !important;
}
.btn-reject:disabled {
  background: #FECACA !important;
  border-color: #FECACA !important;
  color: #fff !important;
}

/* Pagination */
.feed-pagination {
  margin-top: 16px;
  justify-content: center;
}
</style>
