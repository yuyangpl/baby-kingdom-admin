import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';
import bcrypt from 'bcryptjs';

const ADMIN_EMAIL = 'admin-poster@test.com';
const PERSONA_ID = 'BK-POSTER-TEST';

let adminToken: string;
let approvedFeedId: string; // UUID string
let noPersonaFeedId: string; // feed whose personaId has no matching persona

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await cleanDB();

  // Create admin user
  await prisma.user.create({
    data: {
      username: 'admin-poster',
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash('admin123', 12),
      role: 'admin',
    },
  });

  // Login to get JWT
  const loginRes = await request
    .post('/api/v1/auth/login')
    .send({ email: ADMIN_EMAIL, password: 'admin123' });
  adminToken = loginRes.body.data.accessToken;

  // Create test persona
  await prisma.persona.create({
    data: {
      accountId: PERSONA_ID,
      username: 'poster-tester',
      archetype: 'pregnant',
      primaryToneMode: 'CASUAL',
      maxPostsPerDay: 10,
      isActive: true,
      postsToday: 0,
    },
  });

  // Approved feed linked to the persona
  const approvedFeed = await prisma.feed.create({
    data: {
      feedId: 'POSTER-TEST-001',
      type: 'reply',
      status: 'approved',
      source: ['scanner'],
      threadTid: 88001,
      threadFid: 162,
      threadSubject: 'Test approved thread',
      personaId: PERSONA_ID,
      bkUsername: 'poster-tester',
      archetype: 'pregnant',
      toneMode: 'CASUAL',
      postType: 'reply',
      draftContent: '\u9019\u662F\u4E00\u689D\u6E2C\u8A66\u56DE\u8986\uFF0C\u7528\u65BC\u78BA\u8A8D poster mock \u6A21\u5F0F\u6B63\u5E38\u904B\u4F5C\u3002',
    },
  });
  approvedFeedId = approvedFeed.id;

  // Feed with non-approved status (pending)
  await prisma.feed.create({
    data: {
      feedId: 'POSTER-TEST-002',
      type: 'reply',
      status: 'pending',
      source: ['scanner'],
      threadTid: 88002,
      threadFid: 162,
      threadSubject: 'Pending feed',
      personaId: PERSONA_ID,
      bkUsername: 'poster-tester',
      archetype: 'pregnant',
      toneMode: 'CASUAL',
      postType: 'reply',
      draftContent: '\u5F85\u5BE9\u6279\u56DE\u8986',
    },
  });

  // Feed whose personaId references a non-existent persona
  const noPersonaFeed = await prisma.feed.create({
    data: {
      feedId: 'POSTER-TEST-004',
      type: 'reply',
      status: 'approved',
      source: ['scanner'],
      threadTid: 88004,
      threadFid: 162,
      threadSubject: 'Feed with missing persona',
      personaId: 'BK-NONEXISTENT-PERSONA',
      bkUsername: 'ghost',
      archetype: 'pregnant',
      toneMode: 'CASUAL',
      postType: 'reply',
      draftContent: '\u627E\u4E0D\u5230 persona \u7684\u56DE\u8986',
    },
  });
  noPersonaFeedId = noPersonaFeed.id;
});

afterAll(async () => {
  await cleanDB();
  await teardownDB();
});

describe('Poster API', () => {
  // Test 1: approved feed gets queued for posting
  it('POST /poster/:id/post queues an approved feed', async () => {
    const prisma = getPrisma();
    // Create fresh approved feed for this test
    const uid = Date.now().toString(36);
    const queueFeed = await prisma.feed.create({
      data: {
        feedId: `POSTER-Q-${uid}`, type: 'reply', status: 'approved', source: ['scanner'],
        threadTid: 88010 + Math.floor(Math.random() * 100000), threadFid: 162, personaId: PERSONA_ID,
        bkUsername: 'poster-tester', archetype: 'pregnant', toneMode: 'CASUAL',
        postType: 'reply', draftContent: '\u4F47\u5217\u6E2C\u8A66',
      },
    });

    const res = await request
      .post(`/api/v1/poster/${queueFeed.id}/post`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(res.body.data.queued).toBe(true);
    expect(res.body.data.feedId).toBeDefined();

    await prisma.feed.delete({ where: { id: queueFeed.id } });
  });

  // Test 2: non-approved status should be rejected with 422
  it('POST /poster/:id/post rejects non-approved feed', async () => {
    const prisma = getPrisma();
    const pendingFeed = await prisma.feed.findFirst({ where: { feedId: 'POSTER-TEST-002' } });
    const res = await request
      .post(`/api/v1/poster/${pendingFeed!.id}/post`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectError(res, 422, 'BUSINESS_ERROR');
  });

  // Test 3: feed not found returns 422 (BusinessError from controller)
  it('POST /poster/:id/post returns 422 when feed not found', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request
      .post(`/api/v1/poster/${fakeId}/post`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectError(res, 422, 'BUSINESS_ERROR');
  });

  // Test 4: approved feed with missing persona still queues (persona check is in worker)
  it('POST /poster/:id/post queues feed even with missing persona', async () => {
    const res = await request
      .post(`/api/v1/poster/${noPersonaFeedId}/post`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(res.body.data.queued).toBe(true);
  });

  // Test 5: postFeed service directly (mock mode)
  it('postFeed service posts feed in mock mode', async () => {
    const prisma = getPrisma();
    const { postFeed } = await import('../../../src/modules/poster/poster.service.js');
    const freshFeed = await prisma.feed.create({
      data: {
        feedId: 'POSTER-TEST-003',
        type: 'reply', status: 'approved', source: ['scanner'],
        threadTid: 88003, threadFid: 162,
        personaId: PERSONA_ID, bkUsername: 'poster-tester',
        archetype: 'pregnant', toneMode: 'CASUAL', postType: 'reply',
        draftContent: '\u6E2C\u8A66\u76F4\u63A5\u767C\u5E16',
      },
    });

    const result = await postFeed(freshFeed.id);
    expect(result.status).toBe('posted');
    expect(result.postId).toMatch(/mock/);
  });

  // Test 6: GET /poster/history returns posted/failed feeds with pagination
  it('GET /poster/history returns feeds with pagination', async () => {
    const res = await request
      .get('/api/v1/poster/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('page');
    // postFeed service test above should have posted at least 1
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  // Test 7: GET /poster/history returns empty array when no posted/failed feeds
  it('GET /poster/history returns empty array when no posted/failed feeds exist', async () => {
    const prisma = getPrisma();
    // Temporarily set all posted/failed feeds back to pending to simulate empty history
    const postedFeeds = await prisma.feed.findMany({ where: { status: { in: ['posted', 'failed'] } } });
    await prisma.feed.updateMany({ where: { status: { in: ['posted', 'failed'] } }, data: { status: 'pending' } });

    const res = await request
      .get('/api/v1/poster/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
    expect(res.body.pagination.total).toBe(0);

    // Restore the feeds
    for (const feed of postedFeeds) {
      await prisma.feed.update({ where: { id: feed.id }, data: { status: feed.status } });
    }
  });

  // Test 8: POST /forums/sync mock mode returns success:false (BK_BASE_URL not set)
  it('POST /forums/sync returns success:false when BK_BASE_URL is not configured', async () => {
    const res = await request
      .post('/api/v1/forums/sync')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.success).toBe(false);
    expect(res.body.data.error).toMatch(/not configured/i);
  });
});
