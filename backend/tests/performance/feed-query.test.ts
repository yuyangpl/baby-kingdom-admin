/**
 * Performance baseline tests — feed query & concurrent load
 *
 * Skipped unless RUN_PERF_TESTS=1 is set so normal CI isn't slowed down.
 * Run with: RUN_PERF_TESTS=1 npm test -- tests/performance/
 */

import { jest } from '@jest/globals';
import { request, setupDB, teardownDB } from '../helpers.js';
import User from '../../src/modules/auth/auth.model.js';
import Feed from '../../src/modules/feed/feed.model.js';

jest.setTimeout(120000);

const PERF_PREFIX = 'FQ-PERF-';
const SEED_COUNT = 10000; // 10k feeds (reduce if still too slow)
const ADMIN_EMAIL = 'admin-perf-fq@test.com';

let adminToken: string;

beforeAll(async () => {
  if (!process.env.RUN_PERF_TESTS) return;

  await setupDB();

  // Create admin user
  await User.findOneAndDelete({ email: ADMIN_EMAIL });
  await User.create({
    username: 'admin-perf-fq',
    email: ADMIN_EMAIL,
    password: 'admin123',
    role: 'admin',
  });

  const loginRes = await request
    .post('/api/v1/auth/login')
    .send({ email: ADMIN_EMAIL, password: 'admin123' });
  adminToken = loginRes.body.data.accessToken;

  // Seed feeds in batches for speed
  console.log(`[perf] Seeding ${SEED_COUNT} feeds…`);
  const seedStart = Date.now();

  const BATCH = 500;
  for (let i = 0; i < SEED_COUNT; i += BATCH) {
    const docs = [];
    for (let j = i; j < Math.min(i + BATCH, SEED_COUNT); j++) {
      const idx = String(j + 1).padStart(5, '0');
      docs.push({
        feedId: `${PERF_PREFIX}${idx}`,
        type: 'reply',
        status: 'pending',
        source: 'scanner',
        threadTid: 900000 + j,
        threadFid: 162,
        personaId: 'BK-PERF-TEST',
        draftContent: `performance test content for feed ${idx}`,
        charCount: 30 + (j % 20),
      });
    }
    await Feed.insertMany(docs, { ordered: false });
  }

  console.log(`[perf] Seeding done in ${Date.now() - seedStart}ms`);
});

afterAll(async () => {
  if (!process.env.RUN_PERF_TESTS) return;
  await Feed.deleteMany({ feedId: new RegExp(`^${PERF_PREFIX}`) });
  await User.findOneAndDelete({ email: ADMIN_EMAIL });
  await teardownDB();
});

// ---------------------------------------------------------------------------
// Test 1: GET /feeds?status=pending — p95 < 200ms
// ---------------------------------------------------------------------------
describe('Performance: GET /feeds?status=pending', () => {
  it(`p95 latency < 200ms over 20 requests (dataset: ${SEED_COUNT} feeds)`, async () => {
    if (!process.env.RUN_PERF_TESTS) {
      console.log('[perf] Skipped (set RUN_PERF_TESTS=1 to run)');
      return;
    }

    const RUNS = 20;
    const latencies = [];

    for (let i = 0; i < RUNS; i++) {
      const t0 = Date.now();
      const res = await request
        .get('/api/v1/feeds?status=pending&limit=20')
        .set('Authorization', `Bearer ${adminToken}`);
      const elapsed = Date.now() - t0;
      latencies.push(elapsed);
      expect(res.status).toBe(200);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(RUNS * 0.5)];
    const p95 = latencies[Math.floor(RUNS * 0.95)];
    const p99 = latencies[Math.floor(RUNS * 0.99)];

    console.log(
      `[perf] GET /feeds p50=${p50}ms  p95=${p95}ms  p99=${p99}ms  (n=${RUNS})`
    );

    expect(p95).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// Test 2: 50 concurrent GET /feeds — p99 < 500ms
// ---------------------------------------------------------------------------
describe('Performance: 50 concurrent GET /feeds', () => {
  it('p99 latency < 500ms for 50 concurrent requests', async () => {
    if (!process.env.RUN_PERF_TESTS) {
      console.log('[perf] Skipped (set RUN_PERF_TESTS=1 to run)');
      return;
    }

    const CONCURRENCY = 50;

    const t0 = Date.now();
    const promises = Array(CONCURRENCY)
      .fill(null)
      .map(() =>
        (async () => {
          const start = Date.now();
          const res = await request
            .get('/api/v1/feeds?status=pending&limit=20')
            .set('Authorization', `Bearer ${adminToken}`);
          return { status: res.status, elapsed: Date.now() - start };
        })()
      );

    const results = await Promise.all(promises);
    const totalElapsed = Date.now() - t0;

    const latencies = results.map((r) => r.elapsed).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(CONCURRENCY * 0.5)];
    const p95 = latencies[Math.floor(CONCURRENCY * 0.95)];
    const p99 = latencies[Math.floor(CONCURRENCY * 0.99)];

    console.log(
      `[perf] 50-concurrent p50=${p50}ms  p95=${p95}ms  p99=${p99}ms  wall=${totalElapsed}ms`
    );

    const failed = results.filter((r) => r.status !== 200).length;
    expect(failed).toBe(0);
    expect(p99).toBeLessThan(500);
  });
});
