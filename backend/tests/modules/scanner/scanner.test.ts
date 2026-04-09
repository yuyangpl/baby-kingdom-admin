import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';
import ToneMode from '../../../src/modules/tone/tone.model.js';
import { ForumBoard, ForumCategory } from '../../../src/modules/forum/forum.model.js';
import Feed from '../../../src/modules/feed/feed.model.js';
import Config from '../../../src/modules/config/config.model.js';

let adminToken: string;

beforeAll(async () => {
  await setupDB();
  await User.deleteMany({});
  await Persona.deleteMany({});
  await ToneMode.deleteMany({});
  await ForumCategory.deleteMany({});
  await ForumBoard.deleteMany({});
  await Feed.deleteMany({});
  await Config.deleteMany({});

  // Seed test data
  await User.create({ username: 'admin', email: 'admin@test.com', password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;

  await ToneMode.create({ toneId: 'CASUAL', displayName: '輕鬆閒聊' });
  await ToneMode.create({ toneId: 'EMPATHISE', displayName: '同理共感', suitableForTier3: true });

  const persona = await Persona.create({
    accountId: 'BK001', username: 'testmom', archetype: 'pregnant',
    primaryToneMode: 'CASUAL', maxPostsPerDay: 10, postsToday: 0, isActive: true,
    voiceCues: ['test cue'], catchphrases: ['test phrase'],
  });

  const cat = await ForumCategory.create({ name: 'Test', sortOrder: 1 });
  await ForumBoard.create({
    categoryId: cat._id, name: '自由講場', fid: 162,
    enableScraping: true, enableAutoReply: true,
    replyThreshold: { min: 0, max: 40 },
    personaBindings: [{ personaId: persona._id, toneMode: 'CASUAL', weight: 'high', dailyLimit: 5 }],
  });

  // Config for scanner
  await Config.create({ key: 'MAX_PENDING_QUEUE', value: '100', category: 'scanner' });
  await Config.create({ key: 'SCANNER_RELEVANCE_THRESHOLD', value: '35', category: 'scanner' });
  await Config.create({ key: 'SCANNER_TIMEOUT_MINUTES', value: '5', category: 'scanner' });
  await Config.create({ key: 'SENTIMENT_NEGATIVE_THRESHOLD', value: '45', category: 'gemini' });
  await Config.create({ key: 'TONE_OVERRIDE_ON_TIER3', value: 'EMPATHISE', category: 'gemini' });
});

afterAll(async () => {
  await User.deleteMany({});
  await Persona.deleteMany({});
  await ToneMode.deleteMany({});
  await ForumCategory.deleteMany({});
  await ForumBoard.deleteMany({});
  await Feed.deleteMany({});
  await Config.deleteMany({});
  await teardownDB();
});

describe('Scanner', () => {
  it('POST /scanner/trigger runs scan with mock data', async () => {
    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.scanned).toBeGreaterThan(0);
    expect(res.body.data.feeds).toBeGreaterThan(0);
  });

  it('creates feeds in pending status after scan', async () => {
    const feeds = await Feed.find({ source: { $in: ['scanner'] } });
    expect(feeds.length).toBeGreaterThan(0);

    const feed = feeds[0];
    expect(feed.status).toBe('pending');
    expect(feed.personaId).toBe('BK001');
    expect(feed.draftContent).toBeDefined();
    expect(feed.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(feed.feedId).toMatch(/^FQ-/);
    expect(feed.charCount).toBeGreaterThan(0);
  });

  it('GET /scanner/history returns scan feeds', async () => {
    const res = await request
      .get('/api/v1/scanner/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
  });

  it('does not create duplicate feeds for same tid', async () => {
    const beforeCount = await Feed.countDocuments({ source: { $in: ['scanner'] } });

    await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    const afterCount = await Feed.countDocuments({ source: { $in: ['scanner'] } });
    expect(afterCount).toBe(beforeCount); // no new feeds since same mock tids
  });
});

describe('Scanner — deep behaviour tests', () => {
  // Helper: reset configs to defaults after each test
  afterEach(async () => {
    await Config.updateOne({ key: 'MAX_PENDING_QUEUE' }, { value: '100' });
    await Config.updateOne({ key: 'SCANNER_RELEVANCE_THRESHOLD' }, { value: '35' });
    await Config.updateOne({ key: 'SCANNER_TIMEOUT_MINUTES' }, { value: '5' });
    await ForumBoard.updateMany({}, { enableScraping: true });
    await Persona.updateMany({}, { postsToday: 0 });
    // Remove any extra pending feeds created during queue-full test
    await Feed.deleteMany({ feedId: { $regex: /^FQ-QFULL-/ } });
  });

  it('Test 1: skips scan when pending queue is full (>= MAX_PENDING_QUEUE)', async () => {
    // Create 100 pending feeds to fill the queue (use 'custom' source, unique feedId prefix for cleanup)
    const dummyFeeds = Array.from({ length: 100 }, (_, i) => ({
      feedId: `FQ-QFULL-${String(i).padStart(3, '0')}`,
      type: 'reply',
      status: 'pending',
      source: ['custom'],
      threadTid: 9990000 + i,
      threadFid: 162,
      threadSubject: `Dummy feed ${i}`,
      personaId: 'BK001',
      bkUsername: 'testmom',
      archetype: 'pregnant',
      toneMode: 'CASUAL',
      sensitivityTier: 'Tier 1',
      postType: 'reply',
      draftContent: 'dummy content',
      charCount: 13,
      relevanceScore: 75,
      worthReplying: true,
    }));
    await Feed.insertMany(dummyFeeds);

    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.skipped.queueFull).toBeGreaterThanOrEqual(1);
    expect(res.body.data.feeds).toBe(0);
  });

  it('Test 2: returns 0 scanned when no boards have enableScraping=true', async () => {
    await ForumBoard.updateMany({}, { enableScraping: false });

    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.scanned).toBe(0);
    expect(res.body.data.feeds).toBe(0);
  });

  it('Test 3: board with enableScraping=false is not scanned', async () => {
    // Disable the only board; scanner should return no scanned threads
    await ForumBoard.updateMany({ fid: 162 }, { enableScraping: false });

    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // No boards with enableScraping=true → nothing scanned
    expect(res.body.data.scanned).toBe(0);
  });

  it('Test 4: persona daily limit reached increments noPersona counter', async () => {
    // Exhaust the persona's daily limit
    await Persona.updateMany({ accountId: 'BK001' }, { postsToday: 10, maxPostsPerDay: 10 });

    // Remove existing scanner feeds so duplicate-check doesn't mask the noPersona path
    await Feed.deleteMany({ source: { $in: ['scanner'] } });

    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // With all candidates exhausted, each thread that reaches Layer 7 is counted as noPersona
    expect(res.body.data.skipped.noPersona).toBeGreaterThanOrEqual(1);
    expect(res.body.data.feeds).toBe(0);
  });

  it('Test 5: timeout circuit breaker exits immediately when SCANNER_TIMEOUT_MINUTES=0', async () => {
    await Config.updateOne({ key: 'SCANNER_TIMEOUT_MINUTES' }, { value: '0' });

    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // With 0-minute timeout the inner loop breaks before any feed is generated
    expect(res.body.data.feeds).toBe(0);
  });

  it('Test 6: high relevance threshold (100) prevents any feeds from being generated', async () => {
    await Config.updateOne({ key: 'SCANNER_RELEVANCE_THRESHOLD' }, { value: '100' });

    // Remove existing scanner feeds so duplicates don't interfere
    await Feed.deleteMany({ source: { $in: ['scanner'] } });

    const res = await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Mock Gemini returns relevanceScore=75, which is below 100 → all filtered as lowRelevance
    expect(res.body.data.feeds).toBe(0);
    expect(res.body.data.skipped.lowRelevance).toBeGreaterThanOrEqual(1);
  });
});
