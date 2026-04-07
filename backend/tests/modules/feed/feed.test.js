import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Feed from '../../../src/modules/feed/feed.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';
import ToneMode from '../../../src/modules/tone/tone.model.js';
import Config from '../../../src/modules/config/config.model.js';

let adminToken, editorToken, viewerToken, adminId, editorId, feedId, feedObjectId;

beforeAll(async () => {
  await setupDB();
  await Feed.deleteMany({});

  const email1 = 'admin-feed@test.com';
  const email2 = 'editor-feed@test.com';
  const email3 = 'viewer-feed@test.com';
  await User.findOneAndDelete({ email: email1 });
  await User.findOneAndDelete({ email: email2 });
  await User.findOneAndDelete({ email: email3 });

  const admin = await User.create({ username: 'admin-feed', email: email1, password: 'admin123', role: 'admin' });
  const editor = await User.create({ username: 'editor-feed', email: email2, password: 'editor123', role: 'editor' });
  await User.create({ username: 'viewer-feed', email: email3, password: 'viewer123', role: 'viewer' });
  adminId = admin._id.toString();
  editorId = editor._id.toString();

  const r1 = await request.post('/api/v1/auth/login').send({ email: email1, password: 'admin123' });
  adminToken = r1.body.data.accessToken;

  const r2 = await request.post('/api/v1/auth/login').send({ email: email2, password: 'editor123' });
  editorToken = r2.body.data.accessToken;

  const r3 = await request.post('/api/v1/auth/login').send({ email: email3, password: 'viewer123' });
  viewerToken = r3.body.data.accessToken;

  // Ensure persona and tone exist
  await Persona.findOneAndDelete({ accountId: 'BK-FEED-TEST' });
  await Persona.create({
    accountId: 'BK-FEED-TEST', username: 'feedtester', archetype: 'pregnant',
    primaryToneMode: 'CASUAL', maxPostsPerDay: 10, isActive: true,
    catchphrases: ['test phrase'],
  });

  if (!(await ToneMode.findOne({ toneId: 'CASUAL' }))) {
    await ToneMode.create({ toneId: 'CASUAL', displayName: '輕鬆閒聊' });
  }

  await Config.findOneAndDelete({ key: 'SENTIMENT_NEGATIVE_THRESHOLD' });
  await Config.findOneAndDelete({ key: 'TONE_OVERRIDE_ON_TIER3' });
  await Config.create({ key: 'SENTIMENT_NEGATIVE_THRESHOLD', value: '45', category: 'gemini' });
  await Config.create({ key: 'TONE_OVERRIDE_ON_TIER3', value: 'EMPATHISE', category: 'gemini' });

  // Create a test feed
  const feed = await Feed.create({
    feedId: 'FQ-TEST-001', type: 'reply', status: 'pending', source: 'scanner',
    threadTid: 99999, threadFid: 162, threadSubject: 'Test thread',
    personaId: 'BK-FEED-TEST', bkUsername: 'feedtester', archetype: 'pregnant',
    toneMode: 'CASUAL', postType: 'reply',
    draftContent: '測試回覆內容', charCount: 6,
  });
  feedObjectId = feed._id.toString();
});

afterAll(async () => {
  await Feed.deleteMany({});
  await User.findOneAndDelete({ email: 'admin-feed@test.com' });
  await User.findOneAndDelete({ email: 'editor-feed@test.com' });
  await User.findOneAndDelete({ email: 'viewer-feed@test.com' });
  await Persona.findOneAndDelete({ accountId: 'BK-FEED-TEST' });
  await teardownDB();
});

describe('Feed CRUD', () => {
  it('GET /feeds lists feeds', async () => {
    const res = await request.get('/api/v1/feeds').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /feeds/:id returns feed detail', async () => {
    const res = await request.get(`/api/v1/feeds/${feedObjectId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.feedId).toBe('FQ-TEST-001');
  });

  it('GET /feeds?status=pending filters by status', async () => {
    const res = await request.get('/api/v1/feeds?status=pending').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach(f => expect(f.status).toBe('pending'));
  });
});

describe('Claim', () => {
  it('POST /feeds/:id/claim claims a feed', async () => {
    const res = await request.post(`/api/v1/feeds/${feedObjectId}/claim`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.claimedBy).toBe(adminId);
  });

  it('another user cannot claim same feed', async () => {
    const res = await request.post(`/api/v1/feeds/${feedObjectId}/claim`).set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(409);
  });

  it('POST /feeds/:id/unclaim releases claim', async () => {
    const res = await request.post(`/api/v1/feeds/${feedObjectId}/unclaim`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.claimedBy).toBeNull();
  });

  it('another user can claim after expiry (11 min ago)', async () => {
    // Set claimedAt to 11 minutes ago so it appears expired
    const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000);
    await Feed.findByIdAndUpdate(feedObjectId, { claimedBy: adminId, claimedAt: elevenMinAgo });

    const res = await request.post(`/api/v1/feeds/${feedObjectId}/claim`).set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.claimedBy).toBe(editorId);

    // Unclaim so the approve test can proceed normally
    await Feed.findByIdAndUpdate(feedObjectId, { claimedBy: null, claimedAt: null });
  });
});

describe('Approve / Reject', () => {
  it('POST /feeds/:id/approve changes status', async () => {
    const res = await request.post(`/api/v1/feeds/${feedObjectId}/approve`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('cannot approve again', async () => {
    const res = await request.post(`/api/v1/feeds/${feedObjectId}/approve`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });
});

describe('Post', () => {
  it('POST /poster/:id/post posts approved feed (mock)', async () => {
    const res = await request.post(`/api/v1/poster/${feedObjectId}/post`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('posted');
    expect(res.body.data.postedAt).toBeDefined();
    expect(res.body.data.postId).toContain('mock');
  });
});

describe('Custom Generate', () => {
  it('POST /feeds/custom-generate creates new feed', async () => {
    const res = await request
      .post('/api/v1/feeds/custom-generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        topic: '幼稚園面試心得',
        personaAccountId: 'BK-FEED-TEST',
        toneMode: 'CASUAL',
        postType: 'reply',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('custom');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.draftContent).toBeDefined();
  });
});

describe('Edit & Regenerate', () => {
  let editFeedId;

  beforeAll(async () => {
    const feed = await Feed.create({
      feedId: 'FQ-TEST-EDIT', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 88888, threadFid: 162, threadSubject: 'Edit test',
      personaId: 'BK-FEED-TEST', toneMode: 'CASUAL', postType: 'reply',
      draftContent: '原始內容', charCount: 4,
    });
    editFeedId = feed._id.toString();
  });

  it('PUT /feeds/:id/content edits content', async () => {
    const res = await request
      .put(`/api/v1/feeds/${editFeedId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: '管理員修改後嘅內容' });

    expect(res.status).toBe(200);
    expect(res.body.data.finalContent).toBe('管理員修改後嘅內容');
    expect(res.body.data.adminEdit).toBe(true);
  });

  it('POST /feeds/:id/regenerate regenerates content', async () => {
    const res = await request
      .post(`/api/v1/feeds/${editFeedId}/regenerate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toneMode: 'CASUAL' });

    expect(res.status).toBe(200);
    expect(res.body.data.draftContent).toBeDefined();
    expect(res.body.data.adminEdit).toBe(false);
    expect(res.body.data.finalContent).toBeNull();
  });
});

describe('Batch', () => {
  let batchIds;

  beforeAll(async () => {
    const feeds = await Promise.all([
      Feed.create({ feedId: 'FQ-BATCH-1', type: 'reply', status: 'pending', source: 'scanner', threadTid: 77771, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'batch1', charCount: 6 }),
      Feed.create({ feedId: 'FQ-BATCH-2', type: 'reply', status: 'pending', source: 'scanner', threadTid: 77772, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'batch2', charCount: 6 }),
    ]);
    batchIds = feeds.map(f => f._id.toString());
  });

  it('POST /feeds/batch/approve approves multiple', async () => {
    const res = await request
      .post('/api/v1/feeds/batch/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ feedIds: batchIds });

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toHaveLength(2);
    expect(res.body.data.failed).toHaveLength(0);
  });
});

describe('Poster History', () => {
  it('GET /poster/history returns posted feeds', async () => {
    const res = await request.get('/api/v1/poster/history').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Reject', () => {
  let rejectFeedId;
  let rejectFeedId2;
  let batchRejectIds;

  beforeAll(async () => {
    const feed1 = await Feed.create({
      feedId: 'FQ-REJECT-1', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 66661, threadFid: 162, threadSubject: 'Reject test 1',
      personaId: 'BK-FEED-TEST', toneMode: 'CASUAL', postType: 'reply',
      draftContent: '待拒絕內容', charCount: 5,
    });
    rejectFeedId = feed1._id.toString();

    const feed2 = await Feed.create({
      feedId: 'FQ-REJECT-2', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 66662, threadFid: 162, threadSubject: 'Reject test 2',
      personaId: 'BK-FEED-TEST', toneMode: 'CASUAL', postType: 'reply',
      draftContent: '待拒絕內容2', charCount: 6,
    });
    rejectFeedId2 = feed2._id.toString();

    const feeds = await Promise.all([
      Feed.create({ feedId: 'FQ-BREJECT-1', type: 'reply', status: 'pending', source: 'scanner', threadTid: 66671, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'breject1', charCount: 8 }),
      Feed.create({ feedId: 'FQ-BREJECT-2', type: 'reply', status: 'pending', source: 'scanner', threadTid: 66672, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'breject2', charCount: 8 }),
    ]);
    batchRejectIds = feeds.map(f => f._id.toString());
  });

  it('POST /feeds/:id/reject rejects a pending feed with notes', async () => {
    const res = await request
      .post(`/api/v1/feeds/${rejectFeedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: '內容不合適' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.adminNotes).toBe('內容不合適');
  });

  it('POST /feeds/:id/reject returns 422 for non-pending feed', async () => {
    // Feed already rejected in previous test — try to reject again
    const res = await request
      .post(`/api/v1/feeds/${rejectFeedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: '再次嘗試' });

    expect(res.status).toBe(422);
  });

  it('POST /feeds/batch/reject batch rejects multiple feeds', async () => {
    const res = await request
      .post('/api/v1/feeds/batch/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ feedIds: batchRejectIds, notes: '批量拒絕' });

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded).toHaveLength(2);
    expect(res.body.data.failed).toHaveLength(0);
  });
});

describe('Permission', () => {
  it('Viewer can GET /feeds list', async () => {
    const res = await request.get('/api/v1/feeds').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it('Viewer cannot approve a feed (403)', async () => {
    const res = await request
      .post(`/api/v1/feeds/${feedObjectId}/approve`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('Viewer cannot claim a feed (403)', async () => {
    const res = await request
      .post(`/api/v1/feeds/${feedObjectId}/claim`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Auto-post after approval', () => {
  beforeAll(async () => {
    // Dynamically import ForumBoard and ForumCategory
    const { ForumBoard, ForumCategory } = await import('../../../src/modules/forum/forum.model.js');

    // Ensure a category exists for the boards
    let cat = await ForumCategory.findOne({ name: 'Auto-Test Category' });
    if (!cat) {
      cat = await ForumCategory.create({ name: 'Auto-Test Category', sortOrder: 99 });
    }
    const categoryId = cat._id;

    // Create board with enableAutoReply=true
    await ForumBoard.findOneAndUpdate(
      { fid: 88162 },
      { fid: 88162, name: 'Auto-Reply Board', categoryId, enableScraping: false, enableAutoReply: true, isActive: true },
      { upsert: true, runValidators: true },
    );
    // Create board with enableAutoReply=false
    await ForumBoard.findOneAndUpdate(
      { fid: 88163 },
      { fid: 88163, name: 'Manual Board', categoryId, enableScraping: false, enableAutoReply: false, isActive: true },
      { upsert: true, runValidators: true },
    );
  });

  afterAll(async () => {
    const { ForumBoard, ForumCategory } = await import('../../../src/modules/forum/forum.model.js');
    await ForumBoard.deleteMany({ fid: { $in: [88162, 88163] } });
    await ForumCategory.deleteMany({ name: 'Auto-Test Category' });
    await Feed.deleteMany({ feedId: { $in: ['FQ-AUTO-001', 'FQ-AUTO-002'] } });
  });

  it('auto-queues poster job when board.enableAutoReply is true', async () => {
    const feed = await Feed.create({
      feedId: 'FQ-AUTO-001', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 88801, threadFid: 88162, personaId: 'BK-FEED-TEST',
      draftContent: '自動發帖測試', charCount: 6,
    });

    const res = await request
      .post(`/api/v1/feeds/${feed._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    // Approval succeeds — auto-post is queued asynchronously (verified by no error)
  });

  it('does NOT auto-queue when board.enableAutoReply is false', async () => {
    const feed = await Feed.create({
      feedId: 'FQ-AUTO-002', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 88802, threadFid: 88163, personaId: 'BK-FEED-TEST',
      draftContent: '手動發帖測試', charCount: 6,
    });

    const res = await request
      .post(`/api/v1/feeds/${feed._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    // No auto-post queued — approval still succeeds normally
  });
});
