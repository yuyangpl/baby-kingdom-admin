/**
 * Performance baseline tests — batch operations & scanner trigger & similarity check
 *
 * Skipped unless RUN_PERF_TESTS=1 is set so normal CI isn't slowed down.
 * Run with: RUN_PERF_TESTS=1 npm test -- tests/performance/
 */

import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB } from '../helpers.js';
import { getPrisma } from '../../src/shared/database.js';
import { checkSimilarity } from '../../src/modules/gemini/quality-guard.js';

jest.setTimeout(120000);

const PERF_PREFIX = 'BO-PERF-';
const ADMIN_EMAIL = 'admin-perf-bo@test.com';
const BATCH_SIZE = 50;

let adminToken: string;
let batchFeedIds: string[] = [];

beforeAll(async () => {
  if (!process.env.RUN_PERF_TESTS) return;

  await setupDB();
  const prisma = getPrisma();

  // Create admin user
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
  await prisma.user.create({
    data: {
      username: 'admin-perf-bo',
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash('admin123', 12),
      role: 'admin',
    },
  });

  const loginRes = await request
    .post('/api/v1/auth/login')
    .send({ email: ADMIN_EMAIL, password: 'admin123' });
  adminToken = loginRes.body.data.accessToken;

  // Seed 50 pending feeds for batch approve test
  const feedPromises = Array.from({ length: BATCH_SIZE }, (_, i) => {
    const idx = String(i + 1).padStart(5, '0');
    return prisma.feed.create({
      data: {
        feedId: `${PERF_PREFIX}${idx}`,
        type: 'reply',
        status: 'pending',
        source: ['scanner'],
        threadTid: 800000 + i,
        threadFid: 162,
        personaId: 'BK-PERF-TEST',
        draftContent: `batch performance test content ${idx}`,
        charCount: 30 + i,
      },
    });
  });

  const inserted = await Promise.all(feedPromises);
  batchFeedIds = inserted.map((d) => d.id);
});

afterAll(async () => {
  if (!process.env.RUN_PERF_TESTS) return;
  const prisma = getPrisma();
  await prisma.feed.deleteMany({ where: { feedId: { startsWith: PERF_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
  await teardownDB();
});

// ---------------------------------------------------------------------------
// Test 3: POST /feeds/batch/approve (50 feeds) — < 5s
// ---------------------------------------------------------------------------
describe('Performance: POST /feeds/batch/approve', () => {
  it(`approves ${BATCH_SIZE} feeds in < 5000ms`, async () => {
    if (!process.env.RUN_PERF_TESTS) {
      console.log('[perf] Skipped (set RUN_PERF_TESTS=1 to run)');
      return;
    }

    const t0 = Date.now();
    const res = await request
      .post('/api/v1/feeds/batch/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ feedIds: batchFeedIds });
    const elapsed = Date.now() - t0;

    console.log(
      `[perf] batch/approve ${BATCH_SIZE} feeds => ${elapsed}ms  status=${res.status}`
    );

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ---------------------------------------------------------------------------
// Test 4: POST /scanner/trigger (mock scan) — < 10s
// ---------------------------------------------------------------------------
describe('Performance: POST /scanner/trigger', () => {
  it('scanner trigger completes in < 10000ms', async () => {
    if (!process.env.RUN_PERF_TESTS) {
      console.log('[perf] Skipped (set RUN_PERF_TESTS=1 to run)');
      return;
    }

    const t0 = Date.now();
    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);
    const elapsed = Date.now() - t0;

    console.log(
      `[perf] scanner/trigger => ${elapsed}ms  status=${res.status}  data=${JSON.stringify(res.body.data)}`
    );

    // Accept 200 (ran) or queue-full / no active boards (still a valid fast exit)
    expect([200]).toContain(res.status);
    expect(elapsed).toBeLessThan(10000);
  });
});

// ---------------------------------------------------------------------------
// Test 5: checkSimilarity (1000 history items) — < 100ms
// ---------------------------------------------------------------------------
describe('Performance: checkSimilarity (1000 history items)', () => {
  it('Jaccard similarity check over 1000 items completes in < 100ms', () => {
    if (!process.env.RUN_PERF_TESTS) {
      console.log('[perf] Skipped (set RUN_PERF_TESTS=1 to run)');
      return;
    }

    const HISTORY_SIZE = 1000;

    // Generate 1000 realistic Cantonese-ish content strings
    const history = Array.from({ length: HISTORY_SIZE }, (_, i) =>
      `寶寶${i}個月大，媽媽想問一下關於餵母乳的問題，有冇人試過${i}次都唔夠奶呢？`
    );

    const probe =
      '我個寶寶8個月大，想問一下餵奶嘅問題，係咪有人試過唔夠奶架？';

    const t0 = Date.now();
    const result = checkSimilarity(probe, history);
    const elapsed = Date.now() - t0;

    console.log(
      `[perf] checkSimilarity(1000) => ${elapsed}ms  isDuplicate=${result.isDuplicate}  maxSim=${result.maxSimilarity.toFixed(4)}`
    );

    expect(result).toHaveProperty('isDuplicate');
    expect(result).toHaveProperty('maxSimilarity');
    expect(elapsed).toBeLessThan(100);
  });
});
