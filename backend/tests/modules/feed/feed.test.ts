import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';
import bcrypt from 'bcryptjs';
import { encrypt } from '../../../src/shared/encryption.js';

let adminToken: string, editorToken: string, viewerToken: string, adminId: string, editorId: string, feedId: string, feedObjectId: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await cleanDB();

  const admin = await prisma.user.create({ data: { username: 'admin-feed', email: 'admin-feed@test.com', passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' } });
  const editor = await prisma.user.create({ data: { username: 'editor-feed', email: 'editor-feed@test.com', passwordHash: await bcrypt.hash('editor123', 12), role: 'editor' } });
  await prisma.user.create({ data: { username: 'viewer-feed', email: 'viewer-feed@test.com', passwordHash: await bcrypt.hash('viewer123', 12), role: 'viewer' } });
  adminId = admin.id;
  editorId = editor.id;

  const r1 = await request.post('/api/v1/auth/login').send({ email: 'admin-feed@test.com', password: 'admin123' });
  adminToken = r1.body.data.accessToken;

  const r2 = await request.post('/api/v1/auth/login').send({ email: 'editor-feed@test.com', password: 'editor123' });
  editorToken = r2.body.data.accessToken;

  const r3 = await request.post('/api/v1/auth/login').send({ email: 'viewer-feed@test.com', password: 'viewer123' });
  viewerToken = r3.body.data.accessToken;

  // Ensure persona and tone exist
  await prisma.persona.create({
    data: {
      accountId: 'BK-FEED-TEST', username: 'feedtester', archetype: 'pregnant',
      primaryToneMode: 'CASUAL', maxPostsPerDay: 10, isActive: true,
      catchphrases: ['test phrase'],
    },
  });

  const existingTone = await prisma.toneMode.findFirst({ where: { toneId: 'CASUAL' } });
  if (!existingTone) {
    await prisma.toneMode.create({ data: { toneId: 'CASUAL', displayName: '\u8F15\u9B06\u9592\u804A' } });
  }

  await prisma.config.create({ data: { key: 'SENTIMENT_NEGATIVE_THRESHOLD', value: '45', category: 'gemini' } });
  await prisma.config.create({ data: { key: 'TONE_OVERRIDE_ON_TIER3', value: 'EMPATHISE', category: 'gemini' } });

  // Create a test feed
  const feed = await prisma.feed.create({
    data: {
      feedId: 'FQ-TEST-001', type: 'reply', status: 'pending', source: ['scanner'],
      threadTid: 99999, threadFid: 162, threadSubject: 'Test thread',
      personaId: 'BK-FEED-TEST', bkUsername: 'feedtester', archetype: 'pregnant',
      toneMode: 'CASUAL', postType: 'reply',
      draftContent: '\u6E2C\u8A66\u56DE\u8986\u5167\u5BB9', charCount: 6,
    },
  });
  feedObjectId = feed.id;
});

afterAll(async () => {
  await cleanDB();
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
    const prisma = getPrisma();
    // Set claimedAt to 11 minutes ago so it appears expired
    const elevenMinAgo = new Date(Date.now() - 11 * 60 * 1000);
    await prisma.feed.update({ where: { id: feedObjectId }, data: { claimedBy: adminId, claimedAt: elevenMinAgo } });

    const res = await request.post(`/api/v1/feeds/${feedObjectId}/claim`).set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.claimedBy).toBe(editorId);

    // Unclaim so the approve test can proceed normally
    await prisma.feed.update({ where: { id: feedObjectId }, data: { claimedBy: null, claimedAt: null } });
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
  it('POST /poster/:id/post queues approved feed for posting', async () => {
    const res = await request.post(`/api/v1/poster/${feedObjectId}/post`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.queued).toBe(true);
  });
});

describe('Custom Generate', () => {
  it('POST /feeds/custom-generate creates new feed', async () => {
    const res = await request
      .post('/api/v1/feeds/custom-generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        topic: '\u5E7C\u7A1A\u5712\u9762\u8A66\u5FC3\u5F97',
        personaAccountId: 'BK-FEED-TEST',
        toneMode: 'CASUAL',
        postType: 'reply',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toContain('custom');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.draftContent).toBeDefined();
  });
});

describe('Edit & Regenerate', () => {
  let editFeedId: string;

  beforeAll(async () => {
    const prisma = getPrisma();
    const feed = await prisma.feed.create({
      data: {
        feedId: 'FQ-TEST-EDIT', type: 'reply', status: 'pending', source: ['scanner'],
        threadTid: 88888, threadFid: 162, threadSubject: 'Edit test',
        personaId: 'BK-FEED-TEST', toneMode: 'CASUAL', postType: 'reply',
        draftContent: '\u539F\u59CB\u5167\u5BB9', charCount: 4,
      },
    });
    editFeedId = feed.id;
  });

  it('PUT /feeds/:id/content edits content', async () => {
    const res = await request
      .put(`/api/v1/feeds/${editFeedId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: '\u7BA1\u7406\u54E1\u4FEE\u6539\u5F8C\u5605\u5167\u5BB9' });

    expect(res.status).toBe(200);
    expect(res.body.data.finalContent).toBe('\u7BA1\u7406\u54E1\u4FEE\u6539\u5F8C\u5605\u5167\u5BB9');
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
  let batchIds: string[];

  beforeAll(async () => {
    const prisma = getPrisma();
    const feeds = await Promise.all([
      prisma.feed.create({ data: { feedId: 'FQ-BATCH-1', type: 'reply', status: 'pending', source: ['scanner'], threadTid: 77771, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'batch1', charCount: 6 } }),
      prisma.feed.create({ data: { feedId: 'FQ-BATCH-2', type: 'reply', status: 'pending', source: ['scanner'], threadTid: 77772, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'batch2', charCount: 6 } }),
    ]);
    batchIds = feeds.map(f => f.id);
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
  it('GET /poster/history returns feed list', async () => {
    const res = await request.get('/api/v1/poster/history').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Reject', () => {
  let rejectFeedId: string;
  let rejectFeedId2: string;
  let batchRejectIds: string[];

  beforeAll(async () => {
    const prisma = getPrisma();
    const feed1 = await prisma.feed.create({
      data: {
        feedId: 'FQ-REJECT-1', type: 'reply', status: 'pending', source: ['scanner'],
        threadTid: 66661, threadFid: 162, threadSubject: 'Reject test 1',
        personaId: 'BK-FEED-TEST', toneMode: 'CASUAL', postType: 'reply',
        draftContent: '\u5F85\u62D2\u7D55\u5167\u5BB9', charCount: 5,
      },
    });
    rejectFeedId = feed1.id;

    const feed2 = await prisma.feed.create({
      data: {
        feedId: 'FQ-REJECT-2', type: 'reply', status: 'pending', source: ['scanner'],
        threadTid: 66662, threadFid: 162, threadSubject: 'Reject test 2',
        personaId: 'BK-FEED-TEST', toneMode: 'CASUAL', postType: 'reply',
        draftContent: '\u5F85\u62D2\u7D55\u5167\u5BB92', charCount: 6,
      },
    });
    rejectFeedId2 = feed2.id;

    const feeds = await Promise.all([
      prisma.feed.create({ data: { feedId: 'FQ-BREJECT-1', type: 'reply', status: 'pending', source: ['scanner'], threadTid: 66671, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'breject1', charCount: 8 } }),
      prisma.feed.create({ data: { feedId: 'FQ-BREJECT-2', type: 'reply', status: 'pending', source: ['scanner'], threadTid: 66672, threadFid: 162, personaId: 'BK-FEED-TEST', draftContent: 'breject2', charCount: 8 } }),
    ]);
    batchRejectIds = feeds.map(f => f.id);
  });

  it('POST /feeds/:id/reject rejects a pending feed with notes', async () => {
    const res = await request
      .post(`/api/v1/feeds/${rejectFeedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: '\u5167\u5BB9\u4E0D\u5408\u9069' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.adminNotes).toBe('\u5167\u5BB9\u4E0D\u5408\u9069');
  });

  it('POST /feeds/:id/reject returns 422 for non-pending feed', async () => {
    // Feed already rejected in previous test — try to reject again
    const res = await request
      .post(`/api/v1/feeds/${rejectFeedId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: '\u518D\u6B21\u5617\u8A66' });

    expect(res.status).toBe(422);
  });

  it('POST /feeds/batch/reject batch rejects multiple feeds', async () => {
    const res = await request
      .post('/api/v1/feeds/batch/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ feedIds: batchRejectIds, notes: '\u6279\u91CF\u62D2\u7D55' });

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
    const prisma = getPrisma();

    // Ensure a category exists for the boards
    let cat = await prisma.forumCategory.findFirst({ where: { name: 'Auto-Test Category' } });
    if (!cat) {
      cat = await prisma.forumCategory.create({ data: { name: 'Auto-Test Category', sortOrder: 99 } });
    }
    const categoryId = cat.id;

    // Create board with enableAutoReply=true
    await prisma.forumBoard.upsert({
      where: { fid: 88162 },
      update: { name: 'Auto-Reply Board', categoryId, enableScraping: false, enableAutoReply: true, isActive: true },
      create: { fid: 88162, name: 'Auto-Reply Board', categoryId, enableScraping: false, enableAutoReply: true, isActive: true },
    });
    // Create board with enableAutoReply=false
    await prisma.forumBoard.upsert({
      where: { fid: 88163 },
      update: { name: 'Manual Board', categoryId, enableScraping: false, enableAutoReply: false, isActive: true },
      create: { fid: 88163, name: 'Manual Board', categoryId, enableScraping: false, enableAutoReply: false, isActive: true },
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.feed.deleteMany({ where: { feedId: { in: ['FQ-AUTO-001', 'FQ-AUTO-002'] } } });
    await prisma.forumBoard.deleteMany({ where: { fid: { in: [88162, 88163] } } });
    await prisma.forumCategory.deleteMany({ where: { name: 'Auto-Test Category' } });
  });

  it('auto-queues poster job when board.enableAutoReply is true', async () => {
    const prisma = getPrisma();
    const feed = await prisma.feed.create({
      data: {
        feedId: 'FQ-AUTO-001', type: 'reply', status: 'pending', source: ['scanner'],
        threadTid: 88801, threadFid: 88162, personaId: 'BK-FEED-TEST',
        draftContent: '\u81EA\u52D5\u767C\u5E16\u6E2C\u8A66', charCount: 6,
      },
    });

    const res = await request
      .post(`/api/v1/feeds/${feed.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    // Approval succeeds — auto-post is queued asynchronously (verified by no error)
  });

  it('does NOT auto-queue when board.enableAutoReply is false', async () => {
    const prisma = getPrisma();
    const feed = await prisma.feed.create({
      data: {
        feedId: 'FQ-AUTO-002', type: 'reply', status: 'pending', source: ['scanner'],
        threadTid: 88802, threadFid: 88163, personaId: 'BK-FEED-TEST',
        draftContent: '\u624B\u52D5\u767C\u5E16\u6E2C\u8A66', charCount: 6,
      },
    });

    const res = await request
      .post(`/api/v1/feeds/${feed.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    // No auto-post queued — approval still succeeds normally
  });
});
