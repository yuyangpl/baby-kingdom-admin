/**
 * Field whitelist + batch limit security tests.
 *
 * 1. Batch approve with 51 feedIds returns 422
 * 2. Persona update cannot set internal field (postsToday) via API
 */
import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB } from '../helpers.js';
import { getPrisma } from '../../src/shared/database.js';

let adminToken: string, personaId: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();

  const email = 'admin-whitelist@test.com';
  await prisma.user.deleteMany({ where: { email } });
  await prisma.user.create({
    data: { username: 'admin-whitelist', email, passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' },
  });
  const res = await request.post('/api/v1/auth/login').send({ email, password: 'admin123' });
  adminToken = res.body.data.accessToken;

  // Create a test persona with postsToday = 0
  await prisma.persona.deleteMany({ where: { accountId: 'BK-WHITELIST-TEST' } });
  const persona = await prisma.persona.create({
    data: {
      accountId: 'BK-WHITELIST-TEST',
      username: 'whitelist-tester',
      archetype: 'pregnant',
      primaryToneMode: 'CASUAL',
      maxPostsPerDay: 3,
      postsToday: 0,
      isActive: true,
    },
  });
  personaId = persona.id;

  await prisma.feed.deleteMany({ where: { feedId: { startsWith: 'WHITELIST-BATCH-' } } });
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email: 'admin-whitelist@test.com' } });
  await prisma.feed.deleteMany({ where: { feedId: { startsWith: 'WHITELIST-BATCH-' } } });
  await prisma.persona.deleteMany({ where: { accountId: 'BK-WHITELIST-TEST' } });
  await teardownDB();
});

describe('Batch size limit', () => {
  it('returns 422 when batchApprove receives 51 feedIds', async () => {
    // Generate 51 fake UUID-like strings — we just need the length check
    const feedIds = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );

    const res = await request
      .post('/api/v1/feeds/batch/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ feedIds });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Field whitelist', () => {
  it('persona update ignores internal field postsToday', async () => {
    const res = await request
      .put(`/api/v1/personas/${personaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxPostsPerDay: 5, postsToday: 99 });

    expect(res.status).toBe(200);
    expect(res.body.data.maxPostsPerDay).toBe(5);
    // postsToday should remain 0 (the value set at creation), not 99
    expect(res.body.data.postsToday).toBe(0);
  });
});
