import { request, setupDB, teardownDB, expectSuccess, expectError } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Feed from '../../../src/modules/feed/feed.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';

const ADMIN_EMAIL = 'admin-poster@test.com';
const PERSONA_ID = 'BK-POSTER-TEST';

let adminToken: string;
let approvedFeedId: string; // MongoDB ObjectId string
let noPersonaFeedId: string; // feed whose personaId has no matching persona

beforeAll(async () => {
  await setupDB();

  // Clean up any leftover data from previous runs
  await User.findOneAndDelete({ email: ADMIN_EMAIL });
  await Persona.findOneAndDelete({ accountId: PERSONA_ID });
  await Feed.deleteMany({ feedId: { $in: [
    'POSTER-TEST-001',
    'POSTER-TEST-002',
    'POSTER-TEST-003',
    'POSTER-TEST-004',
  ] } });

  // Create admin user
  await User.create({
    username: 'admin-poster',
    email: ADMIN_EMAIL,
    password: 'admin123',
    role: 'admin',
  });

  // Login to get JWT
  const loginRes = await request
    .post('/api/v1/auth/login')
    .send({ email: ADMIN_EMAIL, password: 'admin123' });
  adminToken = loginRes.body.data.accessToken;

  // Create test persona
  await Persona.create({
    accountId: PERSONA_ID,
    username: 'poster-tester',
    archetype: 'pregnant',
    primaryToneMode: 'CASUAL',
    maxPostsPerDay: 10,
    isActive: true,
    postsToday: 0,
  });

  // Approved feed linked to the persona
  const approvedFeed = await Feed.create({
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
    draftContent: '這是一條測試回覆，用於確認 poster mock 模式正常運作。',
  });
  approvedFeedId = approvedFeed._id.toString();

  // Feed with non-approved status (pending)
  await Feed.create({
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
    draftContent: '待審批回覆',
  });

  // Feed whose personaId references a non-existent persona
  const noPersonaFeed = await Feed.create({
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
    draftContent: '找不到 persona 的回覆',
  });
  noPersonaFeedId = noPersonaFeed._id.toString();
});

afterAll(async () => {
  await Feed.deleteMany({ feedId: { $in: [
    'POSTER-TEST-001',
    'POSTER-TEST-002',
    'POSTER-TEST-003',
    'POSTER-TEST-004',
  ] } });
  await Persona.findOneAndDelete({ accountId: PERSONA_ID });
  await User.findOneAndDelete({ email: ADMIN_EMAIL });
  await teardownDB();
});

describe('Poster API', () => {
  // Test 1: approved feed gets queued for posting
  it('POST /poster/:id/post queues an approved feed', async () => {
    // Create fresh approved feed for this test
    const uid = Date.now().toString(36);
    const queueFeed = await Feed.create({
      feedId: `POSTER-Q-${uid}`, type: 'reply', status: 'approved', source: ['scanner'],
      threadTid: 88010 + Math.floor(Math.random() * 100000), threadFid: 162, personaId: PERSONA_ID,
      bkUsername: 'poster-tester', archetype: 'pregnant', toneMode: 'CASUAL',
      postType: 'reply', draftContent: '佇列測試',
    });

    const res = await request
      .post(`/api/v1/poster/${queueFeed._id.toString()}/post`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(res.body.data.queued).toBe(true);
    expect(res.body.data.feedId).toBeDefined();

    await Feed.deleteOne({ _id: queueFeed._id });
  });

  // Test 2: non-approved status should be rejected with 422
  it('POST /poster/:id/post rejects non-approved feed', async () => {
    const pendingFeed = await Feed.findOne({ feedId: 'POSTER-TEST-002' });
    const res = await request
      .post(`/api/v1/poster/${pendingFeed._id.toString()}/post`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectError(res, 422, 'BUSINESS_ERROR');
  });

  // Test 3: feed not found returns 422 (BusinessError from controller)
  it('POST /poster/:id/post returns 422 when feed not found', async () => {
    const fakeId = '64f1234567890abcdef12345';
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
    const { postFeed } = await import('../../../src/modules/poster/poster.service.js');
    const freshFeed = await Feed.create({
      feedId: 'POSTER-TEST-003',
      type: 'reply', status: 'approved', source: ['scanner'],
      threadTid: 88003, threadFid: 162,
      personaId: PERSONA_ID, bkUsername: 'poster-tester',
      archetype: 'pregnant', toneMode: 'CASUAL', postType: 'reply',
      draftContent: '測試直接發帖',
    });

    const result = await postFeed(freshFeed._id.toString());
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
    // Temporarily set all posted/failed feeds back to pending to simulate empty history
    const postedFeeds = await Feed.find({ status: { $in: ['posted', 'failed'] } });
    await Feed.updateMany({ status: { $in: ['posted', 'failed'] } }, { status: 'pending' });

    const res = await request
      .get('/api/v1/poster/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
    expect(res.body.pagination.total).toBe(0);

    // Restore the feeds
    for (const feed of postedFeeds) {
      await Feed.findByIdAndUpdate(feed._id, { status: feed.status });
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
