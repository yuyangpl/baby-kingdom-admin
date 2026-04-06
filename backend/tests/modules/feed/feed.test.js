import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Feed from '../../../src/modules/feed/feed.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';
import ToneMode from '../../../src/modules/tone/tone.model.js';
import Config from '../../../src/modules/config/config.model.js';

let adminToken, editorToken, adminId, feedId, feedObjectId;

beforeAll(async () => {
  await setupDB();
  await Feed.deleteMany({});

  const email1 = 'admin-feed@test.com';
  const email2 = 'editor-feed@test.com';
  await User.findOneAndDelete({ email: email1 });
  await User.findOneAndDelete({ email: email2 });

  const admin = await User.create({ username: 'admin-feed', email: email1, password: 'admin123', role: 'admin' });
  await User.create({ username: 'editor-feed', email: email2, password: 'editor123', role: 'editor' });
  adminId = admin._id.toString();

  const r1 = await request.post('/api/v1/auth/login').send({ email: email1, password: 'admin123' });
  adminToken = r1.body.data.accessToken;

  const r2 = await request.post('/api/v1/auth/login').send({ email: email2, password: 'editor123' });
  editorToken = r2.body.data.accessToken;

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
