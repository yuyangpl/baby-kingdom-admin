import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';
import ToneMode from '../../../src/modules/tone/tone.model.js';
import { ForumBoard, ForumCategory } from '../../../src/modules/forum/forum.model.js';
import Feed from '../../../src/modules/feed/feed.model.js';
import Config from '../../../src/modules/config/config.model.js';

let adminToken;

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
    const feeds = await Feed.find({ source: 'scanner' });
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
    const beforeCount = await Feed.countDocuments({ source: 'scanner' });

    await request
      .post('/api/v1/scanner/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    const afterCount = await Feed.countDocuments({ source: 'scanner' });
    expect(afterCount).toBe(beforeCount); // no new feeds since same mock tids
  });
});
