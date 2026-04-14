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
  const rawClaimed = await prisma.$queryRawUnsafe<any[]>(`
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
    RETURNING id
  `, batchSize, userId, ttl);

  // Re-query with Prisma to get consistent camelCase field names
  const claimedIds = rawClaimed.map(r => r.id);
  const claimed = claimedIds.length > 0
    ? await prisma.feed.findMany({ where: { id: { in: claimedIds } }, orderBy: { createdAt: 'asc' } })
    : [];

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
    claimExpiresAt: claimed.length > 0 ? claimed[0].claimExpiresAt : null,
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
  if (!['pending', 'approved'].includes(feed.status)) throw new BusinessError('Can only reject pending or approved feeds');
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

  const updated = await prisma.feed.update({
    where: { id: feed.id },
    data: { claimedBy: null, claimedAt: null, claimExpiresAt: null },
  });

  await auditService.log({
    operator: userId, eventType: 'FEED_SKIPPED', module: 'feed',
    feedId: feed.feedId, targetId: feed.id,
    actionDetail: `Skipped feed ${feed.feedId}`,
  });

  return updated;
}

/**
 * Release all active claims — return pending items back to pool.
 */
export async function releaseClaims(userId: string) {
  const prisma = getPrisma();
  const result = await prisma.feed.updateMany({
    where: {
      claimedBy: userId,
      status: 'pending',
    },
    data: { claimedBy: null, claimedAt: null, claimExpiresAt: null },
  });
  return { released: result.count };
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
 * Personal today's review stats for a user.
 */
export async function myStats(userId: string) {
  const prisma = getPrisma();
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  const endOfDay = new Date(today + 'T23:59:59.999Z');

  const dayRange = { gte: startOfDay, lte: endOfDay };

  const [approved, rejected, posted] = await Promise.all([
    prisma.feed.count({ where: { reviewedBy: userId, status: 'approved', reviewedAt: dayRange } }),
    prisma.feed.count({ where: { reviewedBy: userId, status: 'rejected', reviewedAt: dayRange } }),
    prisma.feed.count({ where: { reviewedBy: userId, status: 'posted', reviewedAt: dayRange } }),
  ]);

  // 跳过数：今天由该用户认领但释放的（audit log SKIP）
  const skipped = await prisma.auditLog.count({
    where: {
      operator: userId,
      eventType: 'FEED_SKIPPED',
      createdAt: dayRange,
    },
  });

  const total = approved + rejected + skipped;

  // 平均用时：从 claimedAt 到 reviewedAt 的秒数
  const reviewedFeeds = await prisma.feed.findMany({
    where: {
      reviewedBy: userId,
      reviewedAt: dayRange,
      claimedAt: { not: null },
    },
    select: { claimedAt: true, reviewedAt: true },
  });
  let avgSeconds = 0;
  if (reviewedFeeds.length > 0) {
    const totalMs = reviewedFeeds.reduce((sum, f) => {
      if (f.claimedAt && f.reviewedAt) {
        return sum + (f.reviewedAt.getTime() - f.claimedAt.getTime());
      }
      return sum;
    }, 0);
    avgSeconds = Math.round(totalMs / reviewedFeeds.length / 1000);
  }

  return { total, approved, rejected, skipped, posted, avgSeconds };
}

/**
 * Team-level stats.
 */
export async function stats(userId?: string) {
  const prisma = getPrisma();
  const now = new Date();
  const [totalPending, claimed, unclaimed] = await Promise.all([
    prisma.feed.count({ where: { status: 'pending' } }),
    // 如果传了 userId，只统计该用户的认领数；否则统计全局
    userId
      ? prisma.feed.count({ where: { status: 'pending', claimedBy: userId, claimExpiresAt: { gt: now } } })
      : prisma.feed.count({ where: { status: 'pending', claimedBy: { not: null }, claimExpiresAt: { gt: now } } }),
    prisma.feed.count({ where: { status: 'pending', OR: [{ claimedBy: null }, { claimExpiresAt: { lt: now } }] } }),
  ]);
  return { totalPending, claimed, unclaimed };
}
