# Batch Claim + Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace auto-assign with "開始審核" batch claim + TTL lease workbench, enabling reviewers to pull N items atomically with `FOR UPDATE SKIP LOCKED`, zero collision.

**Architecture:** Feed 不再在生成时预分配给 approver。改为审核员主动点"開始審核"批量拉取，后端用 Postgres `FOR UPDATE SKIP LOCKED` 原子锁定。claimedBy/claimedAt 复用为 lease 机制，新增 claimExpiresAt 字段做 TTL 自动释放。前端改为工作台模式：一次看一条，键盘 J/K/S 快速操作。

**Tech Stack:** Prisma raw SQL (FOR UPDATE SKIP LOCKED), Express REST, Vue 3 + Element Plus, Pinia

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/prisma/schema.prisma` | Modify | Add `claimExpiresAt`, remove `assignedTo`/`assignedAt` |
| `backend/src/modules/review-queue/review-queue.service.ts` | Create | claimBatch, myWorkbench, approve, reject, skip, extendClaims, stats |
| `backend/src/modules/review-queue/review-queue.controller.ts` | Create | Request handlers for all review-queue endpoints |
| `backend/src/modules/review-queue/review-queue.routes.ts` | Create | 7 endpoints per design doc |
| `backend/src/app.ts` | Modify | Register review-queue routes |
| `backend/src/modules/feed/feed.service.ts` | Modify | Remove autoAssignFeed, assignFeed, assignedTo filtering in list, assignedTo checks in approve/reject |
| `backend/src/modules/feed/feed.routes.ts` | Modify | Remove PUT /:id/assign route |
| `backend/src/modules/feed/feed.controller.ts` | Modify | Remove assign controller |
| `frontend/src/views/feed/FeedView.vue` | Modify | Add "開始審核" CTA, workbench mode, keyboard shortcuts |
| `frontend/src/locales/zh-HK/index.ts` | Modify | Add workbench i18n keys |
| `frontend/src/locales/en/index.ts` | Modify | Add workbench i18n keys |

---

### Task 1: Schema — Add claimExpiresAt, Remove assignedTo

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Update Feed model in schema**

Replace the Assignment and Claim blocks with a unified Claim/Lease block:

```prisma
  // Claim / Lease (batch claim with TTL)
  claimedBy        String?   @map("claimed_by") @db.Uuid
  claimedByUser    User?     @relation("ClaimedFeeds", fields: [claimedBy], references: [id], onDelete: SetNull)
  claimedAt        DateTime? @map("claimed_at") @db.Timestamptz()
  claimExpiresAt   DateTime? @map("claim_expires_at") @db.Timestamptz()
```

Remove:
```prisma
  // DELETE these lines:
  assignedTo       String?   @map("assigned_to") @db.Uuid
  assignedToUser   User?     @relation("AssignedFeeds", fields: [assignedTo], references: [id], onDelete: SetNull)
  assignedAt       DateTime? @map("assigned_at") @db.Timestamptz()
```

Remove from User model:
```prisma
  // DELETE this line:
  assignedFeeds Feed[] @relation("AssignedFeeds")
```

Update indexes — replace `@@index([assignedTo, status])` with:
```prisma
  @@index([status, claimExpiresAt, createdAt])
```

- [ ] **Step 2: Sync DB and regenerate client**

```bash
cd backend && npx prisma db push && npx prisma generate
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: Errors in feed.service.ts (assignedTo references removed). We fix those in Task 3.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "schema: replace assignedTo with claimExpiresAt for batch claim lease"
```

---

### Task 2: Backend — Create review-queue module

**Files:**
- Create: `backend/src/modules/review-queue/review-queue.service.ts`
- Create: `backend/src/modules/review-queue/review-queue.controller.ts`
- Create: `backend/src/modules/review-queue/review-queue.routes.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create review-queue.service.ts**

```typescript
import { getPrisma } from '../../shared/database.js';
import { BusinessError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import * as auditService from '../audit/audit.service.js';
import logger from '../../shared/logger.js';

const DEFAULT_BATCH_SIZE = 10;
const CLAIM_TTL_MINUTES = 30;

/**
 * Atomically claim next N unclaimed/expired pending feeds using FOR UPDATE SKIP LOCKED.
 */
export async function claimBatch(userId: string, count: number = DEFAULT_BATCH_SIZE) {
  const prisma = getPrisma();
  const batchSize = Math.min(Math.max(count, 1), 50);
  const ttl = `${CLAIM_TTL_MINUTES} minutes`;

  // Check if user already has active claims
  const existingClaims = await prisma.feed.count({
    where: { claimedBy: userId, claimExpiresAt: { gt: new Date() } },
  });
  if (existingClaims > 0) {
    throw new BusinessError(`You already have ${existingClaims} active claims. Finish or release them first.`);
  }

  // Atomic batch claim with SKIP LOCKED
  const claimed = await prisma.$queryRawUnsafe<any[]>(`
    WITH picked AS (
      SELECT id FROM feeds
      WHERE status = 'pending'
        AND (claimed_by IS NULL OR claim_expires_at < NOW())
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE feeds
    SET claimed_by = $2::uuid,
        claimed_at = NOW(),
        claim_expires_at = NOW() + $3::interval
    WHERE id IN (SELECT id FROM picked)
    RETURNING *
  `, batchSize, userId, ttl);

  const remaining = await prisma.feed.count({
    where: {
      status: 'pending',
      OR: [
        { claimedBy: null },
        { claimExpiresAt: { lt: new Date() } },
      ],
    },
  });

  return {
    claimed,
    claimExpiresAt: claimed.length > 0 ? claimed[0].claim_expires_at : null,
    remainingInPool: remaining,
  };
}

/**
 * Get current user's active (non-expired) claimed feeds.
 */
export async function myWorkbench(userId: string) {
  const prisma = getPrisma();
  const feeds = await prisma.feed.findMany({
    where: {
      claimedBy: userId,
      claimExpiresAt: { gt: new Date() },
      status: 'pending',
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    feeds,
    claimExpiresAt: feeds.length > 0 ? feeds[0].claimExpiresAt : null,
    total: feeds.length,
  };
}

/**
 * Approve a claimed feed. Requires claimedBy = userId.
 */
export async function approve(feedId: string, userId: string, ip: string) {
  const prisma = getPrisma();
  const feed = await prisma.feed.findFirst({
    where: { id: feedId },
  });
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'pending') throw new BusinessError('Can only approve pending feeds');
  if (feed.claimedBy !== userId) throw new ForbiddenError('You can only approve feeds you have claimed');

  const updated = await prisma.feed.update({
    where: { id: feed.id },
    data: {
      status: 'approved',
      reviewedBy: userId,
      reviewedAt: new Date(),
      claimedBy: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_APPROVED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Approved feed ${feed.feedId}`,
  });

  // Dispatch to poster
  const port = process.env.PORT || 8080;
  fetch(`http://localhost:${port}/tasks/poster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedId: feed.id, triggeredBy: 'approve' }),
    signal: AbortSignal.timeout(30000),
  }).catch(err => logger.warn({ err }, 'Poster task dispatch failed'));

  return updated;
}

/**
 * Reject a claimed feed.
 */
export async function reject(feedId: string, userId: string, notes: string | undefined, ip: string) {
  const prisma = getPrisma();
  const feed = await prisma.feed.findFirst({ where: { id: feedId } });
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'pending') throw new BusinessError('Can only reject pending feeds');
  if (feed.claimedBy !== userId) throw new ForbiddenError('You can only reject feeds you have claimed');

  const updated = await prisma.feed.update({
    where: { id: feed.id },
    data: {
      status: 'rejected',
      reviewedBy: userId,
      reviewedAt: new Date(),
      adminNotes: notes || '',
      claimedBy: null,
      claimedAt: null,
      claimExpiresAt: null,
    },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_REJECTED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id, ip,
    actionDetail: `Rejected feed ${feed.feedId}: ${notes || ''}`,
  });

  return updated;
}

/**
 * Skip — release a single claimed item back to pool.
 */
export async function skip(feedId: string, userId: string) {
  const prisma = getPrisma();
  const feed = await prisma.feed.findFirst({ where: { id: feedId } });
  if (!feed) throw new NotFoundError('Feed');
  if (feed.claimedBy !== userId) throw new ForbiddenError('You can only skip feeds you have claimed');

  return prisma.feed.update({
    where: { id: feed.id },
    data: { claimedBy: null, claimedAt: null, claimExpiresAt: null },
  });
}

/**
 * Heartbeat — extend claim TTL for all user's active claims.
 */
export async function extendClaims(userId: string) {
  const prisma = getPrisma();
  const result = await prisma.feed.updateMany({
    where: {
      claimedBy: userId,
      claimExpiresAt: { gt: new Date() },
      status: 'pending',
    },
    data: {
      claimExpiresAt: new Date(Date.now() + CLAIM_TTL_MINUTES * 60 * 1000),
    },
  });
  return { extended: result.count };
}

/**
 * Team-level stats.
 */
export async function stats() {
  const prisma = getPrisma();
  const now = new Date();
  const [totalPending, claimed, unclaimed] = await Promise.all([
    prisma.feed.count({ where: { status: 'pending' } }),
    prisma.feed.count({ where: { status: 'pending', claimedBy: { not: null }, claimExpiresAt: { gt: now } } }),
    prisma.feed.count({ where: { status: 'pending', OR: [{ claimedBy: null }, { claimExpiresAt: { lt: now } }] } }),
  ]);
  return { totalPending, claimed, unclaimed };
}
```

- [ ] **Step 2: Create review-queue.controller.ts**

```typescript
import { Request, Response } from 'express';
import * as service from './review-queue.service.js';
import { success } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

export async function claimBatch(req: Request, res: Response): Promise<void> {
  const { count } = req.body;
  const result = await service.claimBatch(req.user!.id, count || 10);
  success(res, result);
}

export async function getMyWorkbench(req: Request, res: Response): Promise<void> {
  const result = await service.myWorkbench(req.user!.id);
  success(res, result);
}

export async function approve(req: Request, res: Response): Promise<void> {
  const feed = await service.approve(req.params.id, req.user!.id, req.ip ?? '');
  success(res, feed);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { notes } = req.body;
  const feed = await service.reject(req.params.id, req.user!.id, notes, req.ip ?? '');
  success(res, feed);
}

export async function skip(req: Request, res: Response): Promise<void> {
  const feed = await service.skip(req.params.id, req.user!.id);
  success(res, feed);
}

export async function extendClaims(req: Request, res: Response): Promise<void> {
  const result = await service.extendClaims(req.user!.id);
  success(res, result);
}

export async function getStats(req: Request, res: Response): Promise<void> {
  const result = await service.stats();
  success(res, result);
}
```

- [ ] **Step 3: Create review-queue.routes.ts**

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './review-queue.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.post('/claim-batch', authenticate, authorize('admin', 'approver'), wrap(ctrl.claimBatch));
router.get('/my-workbench', authenticate, authorize('admin', 'approver'), wrap(ctrl.getMyWorkbench));
router.post('/:id/approve', authenticate, authorize('admin', 'approver'), wrap(ctrl.approve));
router.post('/:id/reject', authenticate, authorize('admin', 'approver'), wrap(ctrl.reject));
router.post('/:id/skip', authenticate, authorize('admin', 'approver'), wrap(ctrl.skip));
router.post('/extend-claims', authenticate, authorize('admin', 'approver'), wrap(ctrl.extendClaims));
router.get('/stats', authenticate, wrap(ctrl.getStats));

export default router;
```

- [ ] **Step 4: Register routes in app.ts**

Add after existing feed routes:

```typescript
import reviewQueueRoutes from './modules/review-queue/review-queue.routes.js';
app.use('/api/v1/review-queue', reviewQueueRoutes);
```

- [ ] **Step 5: Type check**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/review-queue/ backend/src/app.ts
git commit -m "feat: add review-queue module — batch claim, workbench, approve/reject/skip/heartbeat"
```

---

### Task 3: Backend — Clean up feed module (remove auto-assign)

**Files:**
- Modify: `backend/src/modules/feed/feed.service.ts`
- Modify: `backend/src/modules/feed/feed.controller.ts`
- Modify: `backend/src/modules/feed/feed.routes.ts`

- [ ] **Step 1: Remove autoAssignFeed and assignFeed from feed.service.ts**

Delete the entire `autoAssignFeed()` function (lines 12-44) and `assignFeed()` function (lines 46-69).

- [ ] **Step 2: Remove assignedTo filtering from list()**

In `feed.service.ts` `list()`, remove the `userId` and `userRole` params and the filtering block:

```typescript
// REMOVE from FeedListParams:
//   userId?: string;
//   userRole?: string;

// REMOVE from list() body:
//   if (userRole && userRole !== 'admin' && userId) {
//     where.assignedTo = userId;
//   }
```

- [ ] **Step 3: Remove assignedTo checks from approve/reject**

In `feed.service.ts`, revert `approve()` and `reject()` signatures back to 3 args (remove `userRole`), remove the ForbiddenError check:

```typescript
export async function approve(feedId: string, userId: string, ip: string) {
  const feed = await findFeed(feedId);
  if (!feed) throw new NotFoundError('Feed');
  if (feed.status !== 'pending') throw new BusinessError('Can only approve pending feeds');
  // Remove: assignedTo check
  // ... rest unchanged
}

export async function reject(feedId: string, userId: string, notes: string | undefined, ip: string) {
  // Same: remove userRole param and assignedTo check
}
```

Fix `batchApprove`/`batchReject` to match (remove hardcoded `'admin'` arg):

```typescript
await approve(id, userId, ip);   // was: approve(id, userId, 'admin', ip)
await reject(id, userId, notes, ip);  // was: reject(id, userId, 'admin', notes, ip)
```

Remove `ForbiddenError` from imports if no longer used.

- [ ] **Step 4: Update feed.controller.ts**

Remove `assign` export. Revert `approve`/`reject` to not pass `user.role`. Remove `userId`/`userRole` from list call:

```typescript
export async function list(req: Request, res: Response): Promise<void> {
  const { status, source, threadFid, personaId, page, limit, sort } = req.query;
  const result = await feedService.list({
    status: status as string | undefined,
    source: source as string | undefined,
    threadFid: threadFid as string | number | undefined,
    personaId: personaId as string | undefined,
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    sort: (sort as string) || '-createdAt',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function approve(req: Request, res: Response): Promise<void> {
  const feed = await feedService.approve(req.params.id as string, (req as any).user.id, req.ip ?? '');
  success(res, feed);
}

export async function reject(req: Request, res: Response): Promise<void> {
  const { notes } = req.body;
  const feed = await feedService.reject(req.params.id as string, (req as any).user.id, notes, req.ip ?? '');
  success(res, feed);
}
```

- [ ] **Step 5: Remove assign route from feed.routes.ts**

Delete:
```typescript
router.put('/:id/assign', authenticate, authorize('admin'), wrap(ctrl.assign));
```

The feed module's approve/reject routes remain for admin direct access (bypassing workbench).

- [ ] **Step 6: Type check and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/modules/feed/
git commit -m "refactor: remove auto-assign from feed module, feed list now returns all pending"
```

---

### Task 4: Frontend — Workbench UI + "開始審核" CTA

**Files:**
- Modify: `frontend/src/views/feed/FeedView.vue`
- Modify: `frontend/src/locales/zh-HK/index.ts`
- Modify: `frontend/src/locales/en/index.ts`

- [ ] **Step 1: Add i18n keys**

In `zh-HK/index.ts` under `feed:`:
```typescript
    startReview: '開始審核',
    startReviewDesc: '抽取 {count} 條',
    workbench: '工作台',
    workbenchProgress: '{current} / {total}',
    workbenchExpiry: '本批次 {minutes} 分鐘後自動釋放',
    workbenchExpired: '上次批次已過期並釋放',
    workbenchEmpty: '暫無待審項目',
    workbenchComplete: '批次完成！',
    workbenchAvgTime: '平均 {seconds} 秒/條',
    skipItem: '跳過',
    nextPreview: '下一條預覽',
    poolRemaining: '待審池剩餘 {count} 條',
    teamClaimed: '團隊已認領 {count} 條',
    refillBatch: '補充下一批',
    exitWorkbench: '退出工作台',
```

In `en/index.ts` under `feed:`:
```typescript
    startReview: 'Start Review',
    startReviewDesc: 'Pull {count} items',
    workbench: 'Workbench',
    workbenchProgress: '{current} / {total}',
    workbenchExpiry: 'Batch expires in {minutes} min',
    workbenchExpired: 'Previous batch expired and released',
    workbenchEmpty: 'No items to review',
    workbenchComplete: 'Batch complete!',
    workbenchAvgTime: 'Avg {seconds}s per item',
    skipItem: 'Skip',
    nextPreview: 'Next preview',
    poolRemaining: '{count} remaining in pool',
    teamClaimed: '{count} claimed by team',
    refillBatch: 'Pull next batch',
    exitWorkbench: 'Exit workbench',
```

- [ ] **Step 2: Add workbench state and API calls to FeedView.vue script**

Add after existing refs:

```typescript
// Workbench state
const workbenchMode = ref(false)
const workbenchFeeds = ref<any[]>([])
const workbenchIndex = ref(0)
const workbenchExpiresAt = ref<string | null>(null)
const poolRemaining = ref(0)
const teamStats = ref({ totalPending: 0, claimed: 0, unclaimed: 0 })
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

const currentWorkbenchFeed = computed(() =>
  workbenchFeeds.value[workbenchIndex.value] || null
)

const startReview = async () => {
  try {
    const res: any = await api.post('/v1/review-queue/claim-batch', { count: 10 })
    const data = res.data || res
    if (!data.claimed || data.claimed.length === 0) {
      ElMessage.info(t('feed.workbenchEmpty'))
      return
    }
    workbenchFeeds.value = data.claimed
    workbenchIndex.value = 0
    workbenchExpiresAt.value = data.claimExpiresAt
    poolRemaining.value = data.remainingInPool
    workbenchMode.value = true
    startHeartbeat()
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  }
}

const workbenchApprove = async () => {
  const feed = currentWorkbenchFeed.value
  if (!feed) return
  try {
    await api.post(`/v1/review-queue/${feed.id}/approve`)
    ElMessage.success(t('feed.approve'))
    advanceWorkbench()
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  }
}

const workbenchReject = async () => {
  const feed = currentWorkbenchFeed.value
  if (!feed) return
  try {
    const { value: notes } = await ElMessageBox.prompt(t('feed.rejectNotesPrompt'), t('feed.reject'), {
      confirmButtonText: t('feed.reject'),
      cancelButtonText: t('common.cancel'),
      inputType: 'textarea',
    })
    await api.post(`/v1/review-queue/${feed.id}/reject`, { notes })
    ElMessage.success(t('feed.reject'))
    advanceWorkbench()
  } catch (err: any) {
    if (err === 'cancel') return
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  }
}

const workbenchSkip = async () => {
  const feed = currentWorkbenchFeed.value
  if (!feed) return
  try {
    await api.post(`/v1/review-queue/${feed.id}/skip`)
    advanceWorkbench()
  } catch (err: any) {
    ElMessage.error(err.error?.message || err.message || t('common.error'))
  }
}

const advanceWorkbench = () => {
  workbenchFeeds.value.splice(workbenchIndex.value, 1)
  if (workbenchFeeds.value.length === 0) {
    workbenchMode.value = false
    stopHeartbeat()
    ElMessage.success(t('feed.workbenchComplete'))
    loadFeeds()
    return
  }
  if (workbenchIndex.value >= workbenchFeeds.value.length) {
    workbenchIndex.value = workbenchFeeds.value.length - 1
  }
}

const exitWorkbench = () => {
  workbenchMode.value = false
  stopHeartbeat()
  loadFeeds()
}

const startHeartbeat = () => {
  stopHeartbeat()
  heartbeatTimer = setInterval(async () => {
    try {
      await api.post('/v1/review-queue/extend-claims')
    } catch { /* ignore */ }
  }, 5 * 60 * 1000) // every 5 min
}

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

const loadStats = async () => {
  try {
    const res: any = await api.get('/v1/review-queue/stats')
    teamStats.value = res.data || res
  } catch { /* ignore */ }
}

// Keyboard shortcuts
const handleKeydown = (e: KeyboardEvent) => {
  if (!workbenchMode.value) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  switch (e.key.toLowerCase()) {
    case 'j': e.preventDefault(); workbenchApprove(); break
    case 'k': e.preventDefault(); workbenchReject(); break
    case 's': e.preventDefault(); workbenchSkip(); break
  }
}
```

Update `onMounted`:
```typescript
onMounted(() => {
  loadFeeds()
  loadTones()
  loadBoards()
  loadStats()
  // Check for existing workbench
  api.get('/v1/review-queue/my-workbench').then((res: any) => {
    const data = res.data || res
    if (data.feeds && data.feeds.length > 0) {
      workbenchFeeds.value = data.feeds
      workbenchIndex.value = 0
      workbenchExpiresAt.value = data.claimExpiresAt
      workbenchMode.value = true
      startHeartbeat()
    }
  }).catch(() => {})
  window.addEventListener('keydown', handleKeydown)
})
```

Add `onUnmounted`:
```typescript
import { ref, computed, onMounted, onUnmounted } from 'vue'

onUnmounted(() => {
  stopHeartbeat()
  window.removeEventListener('keydown', handleKeydown)
})
```

- [ ] **Step 3: Add workbench template to FeedView.vue**

Add after the status tabs section, before the feed cards loop — wrap the main content area:

```vue
    <!-- Workbench Mode -->
    <template v-if="workbenchMode && currentWorkbenchFeed">
      <el-card shadow="never" class="workbench-card">
        <template #header>
          <div class="workbench-header">
            <span class="workbench-title">
              {{ $t('feed.workbench') }} ({{ $t('feed.workbenchProgress', { current: workbenchIndex + 1, total: workbenchFeeds.length }) }})
            </span>
            <el-button size="small" @click="exitWorkbench">{{ $t('feed.exitWorkbench') }}</el-button>
          </div>
        </template>

        <div class="workbench-feed">
          <div class="workbench-meta">
            <code>{{ currentWorkbenchFeed.feedId }}</code>
            <el-tag size="small" type="info">{{ currentWorkbenchFeed.personaId }}</el-tag>
            <el-tag size="small">{{ boardMap[currentWorkbenchFeed.threadFid] || `fid:${currentWorkbenchFeed.threadFid}` }}</el-tag>
          </div>

          <h4 v-if="currentWorkbenchFeed.threadSubject" class="workbench-subject">
            {{ currentWorkbenchFeed.threadSubject }}
          </h4>

          <div class="workbench-content">
            {{ currentWorkbenchFeed.finalContent || currentWorkbenchFeed.draftContent }}
          </div>
        </div>

        <div class="workbench-actions">
          <el-button type="success" size="large" @click="workbenchApprove">
            ✓ {{ $t('feed.approve') }} (J)
          </el-button>
          <el-button type="danger" size="large" @click="workbenchReject">
            ✗ {{ $t('feed.reject') }} (K)
          </el-button>
          <el-button size="large" @click="workbenchSkip">
            ↷ {{ $t('feed.skipItem') }} (S)
          </el-button>
        </div>

        <div v-if="workbenchFeeds[workbenchIndex + 1]" class="workbench-preview">
          {{ $t('feed.nextPreview') }}: {{ workbenchFeeds[workbenchIndex + 1].feedId }} —
          {{ (workbenchFeeds[workbenchIndex + 1].threadSubject || '').slice(0, 40) }}...
        </div>
      </el-card>
    </template>

    <!-- "Start Review" CTA (when not in workbench and on pending tab) -->
    <div v-else-if="activeTab === 'pending' && canApprove" class="start-review-cta">
      <div class="cta-stats">
        <span>{{ $t('feed.poolRemaining', { count: teamStats.unclaimed }) }}</span>
        <span>{{ $t('feed.teamClaimed', { count: teamStats.claimed }) }}</span>
      </div>
      <el-button type="primary" size="large" @click="startReview" :disabled="teamStats.unclaimed === 0">
        ▶ {{ $t('feed.startReview') }} ({{ $t('feed.startReviewDesc', { count: 10 }) }})
      </el-button>
    </div>
```

- [ ] **Step 4: Add workbench styles**

```css
.workbench-card {
  margin-bottom: 20px;
}
.workbench-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.workbench-title {
  font-weight: 600;
  font-size: 16px;
}
.workbench-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.workbench-subject {
  font-size: 15px;
  margin: 8px 0;
  color: var(--bk-foreground);
}
.workbench-content {
  background: var(--el-fill-color-lighter);
  padding: 16px;
  border-radius: 8px;
  line-height: 1.8;
  white-space: pre-wrap;
  font-size: 14px;
  max-height: 300px;
  overflow-y: auto;
  margin: 12px 0;
}
.workbench-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 0;
}
.workbench-preview {
  text-align: center;
  color: var(--bk-muted-fg);
  font-size: 13px;
  padding-top: 8px;
  border-top: 1px solid var(--bk-border);
}
.start-review-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 0;
}
.cta-stats {
  display: flex;
  gap: 24px;
  color: var(--bk-muted-fg);
  font-size: 14px;
}
```

- [ ] **Step 5: Remove old claim-related code from FeedView.vue**

Remove:
- `isClaimedByMe()` and `isClaimedByOther()` functions
- `claim()` and `unclaim()` functions
- CSS classes `.feed-card--claimed-mine` and `.feed-card--claimed-other`
- Template lines referencing `feed.claimedBy`, `isClaimedByMe`, `isClaimedByOther`
- `Lock`, `Unlock` icon imports if no longer used

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/feed/FeedView.vue frontend/src/locales/
git commit -m "feat: workbench UI — batch claim CTA, keyboard shortcuts J/K/S, heartbeat"
```

---

### Task 5: Cleanup and Integration Verification

**Files:**
- Modify: `docs/plan-role-permissions.md` (update status)

- [ ] **Step 1: Type check backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 2: Type check frontend**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: PASS (ignore pre-existing ConfigView error)

- [ ] **Step 3: Restart dev services and test**

```bash
./dev.sh restart
```

Manual verification:
1. Login as admin → see "開始審核" button on pending tab
2. Click "開始審核" → workbench loads with 10 items
3. Press J → approve + auto-advance
4. Press K → reject prompt → auto-advance
5. Press S → skip (item returns to pool) → advance
6. Complete batch → "批次完成" message → returns to feed list
7. Stats show correct totalPending/claimed/unclaimed

- [ ] **Step 4: Commit plan update**

```bash
git add docs/
git commit -m "docs: update plan — batch claim workbench complete"
```

---

## Notes

- **Feed module approve/reject routes preserved** — admin can still use direct approve/reject without workbench (for edge cases)
- **claimedBy/claimedAt fields reused** — no destructive migration needed, just added claimExpiresAt
- **assignedTo removed** — the batch claim model replaces pre-assignment entirely
- **Heartbeat every 5 min** — extends TTL so active reviewers don't lose claims
- **Stats polling** — refresh team stats on each workbench exit/complete
