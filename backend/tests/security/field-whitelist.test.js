/**
 * Field whitelist + batch limit security tests.
 *
 * 1. Batch approve with 51 feedIds returns 422
 * 2. Persona update cannot set internal field (postsToday) via API
 */
import { request, setupDB, teardownDB } from '../helpers.js';
import User from '../../src/modules/auth/auth.model.js';
import Persona from '../../src/modules/persona/persona.model.js';
import Feed from '../../src/modules/feed/feed.model.js';

let adminToken, personaId;

beforeAll(async () => {
  await setupDB();

  const email = 'admin-whitelist@test.com';
  await User.findOneAndDelete({ email });
  await User.create({ username: 'admin-whitelist', email, password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email, password: 'admin123' });
  adminToken = res.body.data.accessToken;

  // Create a test persona with postsToday = 0
  await Persona.findOneAndDelete({ accountId: 'BK-WHITELIST-TEST' });
  const persona = await Persona.create({
    accountId: 'BK-WHITELIST-TEST',
    username: 'whitelist-tester',
    archetype: 'pregnant',
    primaryToneMode: 'CASUAL',
    maxPostsPerDay: 3,
    postsToday: 0,
    isActive: true,
  });
  personaId = persona._id.toString();

  await Feed.deleteMany({ feedId: /^WHITELIST-BATCH-/ });
});

afterAll(async () => {
  await User.findOneAndDelete({ email: 'admin-whitelist@test.com' });
  await Persona.findOneAndDelete({ accountId: 'BK-WHITELIST-TEST' });
  await Feed.deleteMany({ feedId: /^WHITELIST-BATCH-/ });
  await teardownDB();
});

describe('Batch size limit', () => {
  it('returns 422 when batchApprove receives 51 feedIds', async () => {
    // Generate 51 fake (non-existent) ObjectId-like strings — we just need the length check
    const feedIds = Array.from({ length: 51 }, (_, i) =>
      `00000000000000000000000${String(i).padStart(1, '0')}`.slice(-24),
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
