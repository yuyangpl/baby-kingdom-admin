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
        <el-tab-pane v-for="tab in ['pending', 'approved', 'posted', 'rejected', 'failed']" :key="tab" :name="tab">
          <template #label>
            {{ $t(`feed.tabs.${tab}`) }}
            <el-badge
              v-if="tabCounts[tab] > 0"
              :value="tabCounts[tab]"
              :max="99"
              class="tab-badge"
            />
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- Quick filter chips -->
      <div class="filter-chips">
        <el-tag
          v-for="src in ['scanner', 'trends', 'custom']"
          :key="src"
          :type="feedStore.filters.source === src ? 'primary' : 'info'"
          :effect="feedStore.filters.source === src ? 'dark' : 'plain'"
          class="filter-chip"
          @click="toggleSourceFilter(src)"
        >
          {{ $t(`feed.sources.${src}`) }}
        </el-tag>
        <el-select
          v-model="boardFilterValue"
          :placeholder="$t('feed.filterBoard')"
          clearable
          filterable
          size="small"
          style="width: 180px; margin-left: 8px;"
          @change="filterByBoard"
        >
          <el-option v-for="b in boards" :key="b.fid" :label="b.name" :value="String(b.fid)" />
        </el-select>
        <el-tag
          v-if="feedStore.filters.source || boardFilterValue"
          type="info"
          effect="plain"
          class="filter-chip"
          @click="clearSourceFilter(); boardFilterValue = ''; feedStore.setFilter('threadFid', ''); loadFeeds()"
        >
          {{ $t('common.clearFilter') }}
        </el-tag>
      </div>
    </div>

    <!-- Feed Cards (scrollable) -->
    <div v-loading="feedStore.loading" class="feed-cards">
      <div
        v-for="feed in feedStore.feeds"
        :key="feed.id || feed._id"
        class="feed-card"
        :class="[tierBorderClass(feed.sensitivityTier)]"
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
            <el-tag v-if="feed.threadFid" size="small" type="info" effect="plain" style="margin-left: 4px;">
              {{ boardName(feed.threadFid) }}
            </el-tag>
            <span v-if="feed.threadTid" class="feed-card__meta">
              tid:{{ feed.threadTid }}
            </span>
          </div>
          <div class="feed-card__header-right">
            <el-tag :type="statusType(feed.status)" size="small">{{ feed.status }}</el-tag>
            <el-tag v-for="s in (Array.isArray(feed.source) ? feed.source : [feed.source])" :key="s" size="small" effect="plain" style="margin-left: 2px;">{{ $t(`feed.sources.${s}`) }}</el-tag>
          </div>
        </div>

        <!-- Card Body -->
        <div class="feed-card__body">
          <!-- Left: Content -->
          <div class="feed-card__content">
            <div class="feed-card__subject">
              <el-tag v-if="feed.postType" size="small" :type="feed.postType === 'new-post' ? 'warning' : 'info'" effect="plain" style="margin-right: 6px;">
                {{ feed.postType === 'new-post' ? $t('common.newPost') : $t('common.reply') }}
              </el-tag>
              {{ feed.subject || feed.threadSubject }}
              <a
                v-if="feed.threadTid || feed.postId"
                class="feed-card__view-thread"
                :href="`https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${feed.threadTid || feed.postId}`"
                target="_blank"
                rel="noopener"
                @click.stop
              >{{ $t('feed.viewThread') }} ↗</a>
            </div>
            <div v-if="feed.trendSummary" class="feed-card__trend-summary">
              {{ feed.trendSummary }}
            </div>
            <div v-if="feed.finalContent || feed.draftContent">
              <span class="feed-card__preview-label">{{ feed.postType === 'new-post' ? $t('feed.newPostContent') : $t('feed.replyContent') }}</span>
              <div class="feed-card__draft-box">{{ feed.finalContent || feed.draftContent }}</div>
            </div>
            <div v-if="feed.failReason" class="feed-card__fail">{{ feed.failReason }}</div>
          </div>
          <!-- Right: Persona Info -->
          <div v-if="feed.bkUsername" class="feed-card__persona">
            <el-button
              v-if="feed.personaId"
              class="feed-card__persona-edit"
              link
              size="small"
              @click.stop="goEditPersona(feed.personaId)"
            >
              <el-icon :size="14"><Edit /></el-icon>
            </el-button>
            <div class="avatar-gradient feed-card__avatar">
              {{ avatarInitial(feed.bkUsername) }}
            </div>
            <div class="feed-card__persona-name">
              {{ feed.bkUsername }}
              <span v-if="feed.personaId" class="feed-card__persona-id">{{ feed.personaId }}</span>
            </div>
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
            <!-- Assignment info -->
            <el-tag v-if="feed.assignedTo && authStore.isAdmin" size="small" type="info" effect="plain">
              {{ $t('feed.assignedTo') }}: {{ feed.assignedToUser?.username || feed.assignedTo }}
            </el-tag>

            <span v-if="feed.charCount" class="feed-card__char-count">
              {{ $t('feed.charCount', { count: feed.charCount }) }}
            </span>
          </div>
          <div class="feed-card__footer-right">
            <el-button v-if="authStore.isApprover && !['posted', 'rejected'].includes(feed.status)" size="small" @click="openEdit(feed)">
              {{ $t('common.edit') }}
            </el-button>
            <el-button v-if="authStore.isApprover && !['posted', 'rejected'].includes(feed.status)" size="small" type="warning" @click="regenerate(feed)">
              {{ $t('feed.regenerate') }}
            </el-button>
            <el-button
              v-if="canApprove && !['rejected', 'posted'].includes(feed.status)"
              size="small"
              class="btn-reject"
              @click="rejectWithNotes(feed)"
            >
              {{ $t('feed.reject') }}
            </el-button>
            <el-button
              v-if="canApprove && ['pending', 'failed'].includes(feed.status)"
              size="small"
              class="btn-approve"
              @click="approve(feed)"
            >
              {{ feed.status === 'failed' ? $t('myDashboard.reApprove') : $t('feed.approve') }}
            </el-button>
            <el-button
              v-if="canApprove && feed.status === 'rejected'"
              size="small"
              class="btn-approve"
              @click="revertToPending(feed)"
            >
              {{ $t('feed.revertToPending') }}
            </el-button>
            <el-button
              v-if="feed.status === 'approved'"
              size="small"
              type="success"
              @click="postNow(feed)"
            >
              {{ $t('feed.postNow') }}
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
      :board-map="boardMap"
      @saved="onFeedSaved"
    />

    <CustomGenerateModal
      v-model="showCustomGenerate"
      @saved="onFeedSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight, ArrowDown, Edit } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '../../api'
import { useFeedStore } from '../../stores/feed'
import { useAuthStore } from '../../stores/auth'
import FeedEditModal from './FeedEditModal.vue'
import CustomGenerateModal from './CustomGenerateModal.vue'

const { t } = useI18n()
const feedStore = useFeedStore()
const authStore = useAuthStore()

// approver and admin can approve/reject
const canApprove = computed(() => authStore.role === 'admin' || authStore.role === 'approver')
const isApproverOnly = computed(() => authStore.role === 'approver')
const activeTab = ref<string>('pending')
const selectedIds = ref<Set<string>>(new Set())
const showEditModal = ref<boolean>(false)
const editRow = ref<Record<string, any> | null>(null)
const showCustomGenerate = ref<boolean>(false)
const pendingCount = ref<number>(0)
const tabCounts = ref<Record<string, number>>({ pending: 0, approved: 0, posted: 0, rejected: 0, failed: 0 })
const tones = ref<{ toneId: string; displayName: string }[]>([])
const personaCache = ref<Record<string, any>>({})
const boards = ref<{ fid: number; name: string }[]>([])
const boardMap = ref<Record<number, string>>({})
const boardFilterValue = ref<string>('')

const loadPersonaDetail = async (accountId: string) => {
  if (!accountId || personaCache.value[accountId]) return
  try {
    const res = await api.get(`/v1/personas/${accountId}`)
    const data = res.data || res
    personaCache.value = { ...personaCache.value, [accountId]: data }
  } catch { /* ignore */ }
}

const loadBoards = async () => {
  try {
    const res: any = await api.get('/v1/forums')
    const tree = res.data || res
    const list: { fid: number; name: string }[] = []
    for (const cat of tree) {
      for (const b of (cat.boards || [])) {
        list.push({ fid: b.fid, name: b.name })
      }
    }
    boards.value = list
    boardMap.value = Object.fromEntries(list.map(b => [b.fid, b.name]))
  } catch { /* ignore */ }
}

const boardName = (fid: number | undefined): string => {
  if (!fid) return '-'
  return boardMap.value[fid] || `fid:${fid}`
}

const filterByBoard = (fid: string) => {
  boardFilterValue.value = fid
  feedStore.setFilter('threadFid', fid)
  loadFeeds()
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

const toggleSelect = (feedId: string, checked: boolean) => {
  const copy = new Set(selectedIds.value)
  if (checked) {
    copy.add(feedId)
  } else {
    copy.delete(feedId)
  }
  selectedIds.value = copy
}

const applyApproverFilter = () => {
  if (!isApproverOnly.value) {
    feedStore.filters.claimedBy = ''
    feedStore.filters.reviewedBy = ''
    return
  }
  const userId = authStore.user?.id || ''
  if (feedStore.filters.status === 'pending') {
    feedStore.filters.claimedBy = userId
    feedStore.filters.reviewedBy = ''
  } else {
    feedStore.filters.claimedBy = ''
    feedStore.filters.reviewedBy = userId
  }
}

const loadFeeds = async () => {
  applyApproverFilter()
  await feedStore.fetchFeeds()
}

const loadTabCounts = async () => {
  const statuses = ['pending', 'approved', 'posted', 'rejected', 'failed']
  const userId = authStore.user?.id || ''
  await Promise.all(statuses.map(async (s) => {
    try {
      const params: Record<string, string | number> = { status: s, limit: 1 }
      if (isApproverOnly.value) {
        if (s === 'pending') {
          params.claimedBy = userId
        } else {
          params.reviewedBy = userId
        }
      }
      const res = await api.get('/v1/feeds', { params })
      tabCounts.value[s] = (res as any).pagination?.total ?? 0
    } catch { /* ignore */ }
  }))
  pendingCount.value = tabCounts.value.pending
}

const onTabChange = (tab: string) => {
  feedStore.setFilter('status', tab)
  selectedIds.value = new Set()
  loadFeeds()
  document.querySelector('.main-content')?.scrollTo(0, 0)
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
  loadTabCounts()
}

const approve = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/approve`)
    ElMessage.success(t('feed.approve'))
    loadFeeds()
    loadTabCounts()
  } catch (err: any) {
    ElMessage.error(err.message || t('common.error'))
  }
}

const revertToPending = async (row: any) => {
  try {
    await api.post(`/v1/feeds/${row.feedId}/revert-pending`)
    ElMessage.success(t('common.success'))
    loadFeeds()
    loadTabCounts()
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
    loadTabCounts()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const postNow = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      t('feed.postNowConfirm'),
      t('feed.postNow'),
      { confirmButtonText: t('feed.postNow'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await api.post(`/v1/poster/${row.id || row._id}/post`)
    ElMessage.success(t('feed.postSuccess'))
    loadFeeds()
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
    loadTabCounts()
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
    loadTabCounts()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.message || t('common.error'))
  }
}

const route = useRoute()
const router = useRouter()

const goEditPersona = (accountId: string) => {
  const href = router.resolve({ path: '/personas', query: { edit: accountId } }).href
  window.open(href, '_blank')
}

onMounted(() => {
  const tab = (route.query.tab as string) || 'pending'
  activeTab.value = tab
  feedStore.setFilter('status', tab)
  loadFeeds()
  loadTabCounts()
  loadTones()
  loadBoards()
})

const onRefreshFeeds = () => {
  loadFeeds()
  loadTabCounts()
}
window.addEventListener('refresh-queue-stats', onRefreshFeeds)

onUnmounted(() => {
  window.removeEventListener('refresh-queue-stats', onRefreshFeeds)
})

watch(() => route.query.tab, (newTab) => {
  if (newTab && newTab !== activeTab.value) {
    activeTab.value = newTab as string
    feedStore.setFilter('status', newTab as string)
    loadFeeds()
    loadTabCounts()
  }
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
  padding-top: 2px;
}

/* Individual Feed Card */
.feed-card {
  background: var(--bk-card);
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius);
  padding: 16px;
  box-shadow: var(--bk-shadow-sm);
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
  align-items: stretch;
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
.feed-card__trend-summary {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin-bottom: 8px;
}
.feed-card__preview {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
  background: #F9FAFB;
  border: 1px solid var(--bk-border);
  border-radius: var(--bk-radius-sm);
  padding: 8px 10px;
  line-height: 1.6;
  white-space: pre-wrap;
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
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
}

.feed-card__fail {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-danger);
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: var(--bk-radius-sm);
  padding: 6px 10px;
  line-height: 1.5;
  word-break: break-all;
}

/* Persona Info */
.feed-card__persona {
  position: relative;
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
.feed-card__persona-edit {
  position: absolute;
  top: 6px;
  right: 6px;
  color: var(--el-color-primary);
  opacity: 0.6;
}
.feed-card__persona-edit:hover {
  opacity: 1;
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
.feed-card__persona-id {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: #909399;
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
