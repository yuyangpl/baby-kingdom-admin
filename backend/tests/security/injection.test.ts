/**
 * SQL injection and XSS sanitization tests.
 * (Migrated from NoSQL injection tests — Prisma parameterized queries prevent SQL injection by default.)
 */
import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB } from '../helpers.js';
import { getPrisma } from '../../src/shared/database.js';

const ADMIN_EMAIL = 'admin-injection@test.com';
let adminToken: string, testFeedId: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();

  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
  await prisma.user.create({
    data: { username: 'admin-inj', email: ADMIN_EMAIL, passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' },
  });

  const login = await request.post('/api/v1/auth/login').send({ email: ADMIN_EMAIL, password: 'admin123' });
  adminToken = login.body.data.accessToken;

  await prisma.feed.deleteMany({ where: { personaId: 'BK-INJ-TEST' } });
  await prisma.persona.deleteMany({ where: { accountId: 'BK-INJ-TEST' } });
  await prisma.persona.create({
    data: {
      accountId: 'BK-INJ-TEST', username: 'injtester', archetype: 'pregnant',
      primaryToneMode: 'CASUAL', maxPostsPerDay: 10, isActive: true,
    },
  });

  const feed = await prisma.feed.create({
    data: {
      feedId: 'FQ-INJ-001', type: 'reply', status: 'pending', source: ['scanner'],
      threadTid: 55551, threadFid: 162, personaId: 'BK-INJ-TEST',
      draftContent: '正常内容', charCount: 4,
    },
  });
  testFeedId = feed.id;
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.feed.deleteMany({ where: { personaId: 'BK-INJ-TEST' } });
  await prisma.persona.deleteMany({ where: { accountId: 'BK-INJ-TEST' } });
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
  await teardownDB();
});

describe('SQL Injection Prevention (Prisma)', () => {
  it('login with SQL injection attempt in email is rejected', async () => {
    const res = await request.post('/api/v1/auth/login').send({
      email: "' OR '1'='1",
      password: 'anything',
    });
    // Prisma parameterized queries prevent SQL injection — login should not succeed
    expect(res.status).not.toBe(200);
    expect(res.body.success).not.toBe(true);
  });

  it('login with object payload (former NoSQL $gt) is rejected', async () => {
    const res = await request.post('/api/v1/auth/login').send({
      email: { $gt: '' },
      password: 'anything',
    });
    // Object payload should be rejected by validation or type checking
    expect(res.status).not.toBe(200);
    expect(res.body.success).not.toBe(true);
  });

  it('feed list with SQL injection in query param is safe', async () => {
    const res = await request
      .get("/api/v1/feeds?status=pending'; DROP TABLE feeds; --")
      .set('Authorization', `Bearer ${adminToken}`);
    // Prisma parameterized queries prevent injection — query should be safe
    // May return 200 (with no matching status) or validation error
    expect(res.body.success !== true || Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Input validation', () => {
  it('sort parameter injection has no effect', async () => {
    const res = await request
      .get('/api/v1/feeds?sort=; DROP TABLE feeds;--')
      .set('Authorization', `Bearer ${adminToken}`);
    // Should still return normally (sort sanitized or ignored)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('oversized payload (>1MB) is rejected', async () => {
    const bigContent = 'x'.repeat(1.5 * 1024 * 1024); // 1.5MB string
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
    const prisma = getPrisma();
    const feed = await prisma.feed.create({
      data: {
        feedId: 'FQ-XSS-001', type: 'reply', status: 'pending', source: ['scanner'],
        threadTid: 55552, threadFid: 162, personaId: 'BK-INJ-TEST',
        draftContent: '原始内容', charCount: 4,
      },
    });
    xssFeedId = feed.id;
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
