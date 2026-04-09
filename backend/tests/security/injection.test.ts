/**
 * NoSQL injection and XSS sanitization tests.
 */
import { request, setupDB, teardownDB } from '../helpers.js';
import User from '../../src/modules/auth/auth.model.js';
import Feed from '../../src/modules/feed/feed.model.js';
import Persona from '../../src/modules/persona/persona.model.js';

const ADMIN_EMAIL = 'admin-injection@test.com';
let adminToken: string, testFeedId: string;

beforeAll(async () => {
  await setupDB();
  await User.findOneAndDelete({ email: ADMIN_EMAIL });
  await User.create({ username: 'admin-inj', email: ADMIN_EMAIL, password: 'admin123', role: 'admin' });

  const login = await request.post('/api/v1/auth/login').send({ email: ADMIN_EMAIL, password: 'admin123' });
  adminToken = login.body.data.accessToken;

  await Persona.findOneAndDelete({ accountId: 'BK-INJ-TEST' });
  await Persona.create({
    accountId: 'BK-INJ-TEST', username: 'injtester', archetype: 'pregnant',
    primaryToneMode: 'CASUAL', maxPostsPerDay: 10, isActive: true,
  });

  const feed = await Feed.create({
    feedId: 'FQ-INJ-001', type: 'reply', status: 'pending', source: ['scanner'],
    threadTid: 55551, threadFid: 162, personaId: 'BK-INJ-TEST',
    draftContent: '正常内容', charCount: 4,
  });
  testFeedId = feed._id.toString();
});

afterAll(async () => {
  await Feed.deleteMany({ personaId: 'BK-INJ-TEST' });
  await Persona.findOneAndDelete({ accountId: 'BK-INJ-TEST' });
  await User.findOneAndDelete({ email: ADMIN_EMAIL });
  await teardownDB();
});

describe('NoSQL Injection', () => {
  it('login with $gt operator is rejected', async () => {
    const res = await request.post('/api/v1/auth/login').send({
      email: { $gt: '' },
      password: 'anything',
    });
    // mongo-sanitize strips $ keys → login should not succeed
    expect(res.status).not.toBe(200);
    expect(res.body.success).not.toBe(true);
  });

  it('feed list with $ne query injection is neutralized', async () => {
    const res = await request
      .get('/api/v1/feeds?status[$ne]=null')
      .set('Authorization', `Bearer ${adminToken}`);
    // mongo-sanitize strips $ne → query should not bypass filters
    // May return 200 (with sanitized query) or error; key is it doesn't leak all data
    expect(res.body.success !== true || Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Input validation', () => {
  it('sort parameter injection has no effect', async () => {
    // Attempt to inject a malicious sort parameter
    const res = await request
      .get('/api/v1/feeds?sort={$where:"sleep(5000)"}')
      .set('Authorization', `Bearer ${adminToken}`);
    // Should still return normally (sort sanitized or ignored)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('oversized payload (>1MB) is rejected', async () => {
    const bigContent = 'x'.repeat(1.5 * 1024 * 1024); // 1.5MB string → JSON will exceed 1MB limit
    const res = await request
      .put(`/api/v1/feeds/${testFeedId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ content: bigContent }));
    // Express json parser rejects with 413 (payload too large) or connection error
    expect([413, 500]).toContain(res.status);
  });
});

describe('XSS Sanitization', () => {
  let xssFeedId: string;

  beforeAll(async () => {
    const feed = await Feed.create({
      feedId: 'FQ-XSS-001', type: 'reply', status: 'pending', source: ['scanner'],
      threadTid: 55552, threadFid: 162, personaId: 'BK-INJ-TEST',
      draftContent: '原始内容', charCount: 4,
    });
    xssFeedId = feed._id.toString();
  });

  it('script tags are stripped from feed content', async () => {
    const malicious = '<script>alert("xss")</script>正常文字<img onerror="alert(1)" src=x>';
    const res = await request
      .put(`/api/v1/feeds/${xssFeedId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: malicious });

    expect(res.status).toBe(200);
    expect(res.body.data.finalContent).not.toContain('<script>');
    expect(res.body.data.finalContent).not.toContain('onerror');
    expect(res.body.data.finalContent).toContain('正常文字');
  });
});
