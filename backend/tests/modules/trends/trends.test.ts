import { request, setupDB, teardownDB, cleanDB } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';
import bcrypt from 'bcryptjs';

let adminToken: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await cleanDB();

  await prisma.user.create({ data: { username: 'admin', email: 'admin@test.com', passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' } });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  await cleanDB();
  await teardownDB();
});

describe('Trends', () => {
  it('GET /trends returns empty initially', async () => {
    const res = await request.get('/api/v1/trends').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('POST /trends/trigger without MediaLens config returns 0', async () => {
    const res = await request
      .post('/api/v1/trends/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pulled).toBe(0);
  });

  it('GET /trends/medialens/token-status shows no token', async () => {
    const res = await request
      .get('/api/v1/trends/medialens/token-status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hasToken).toBe(false);
  });

  it('manually created trends can be listed', async () => {
    const prisma = getPrisma();
    await prisma.trend.create({
      data: {
        pullId: 'PULL-TEST-001',
        source: 'medialens',
        rank: 1,
        topicLabel: '\u5E7C\u7A1A\u5712\u9762\u8A66',
        summary: '\u597D\u591A\u5BB6\u9577\u90FD\u7DCA\u5F35',
        engagements: 5000,
        postCount: 200,
        sensitivityTier: 1,
        sentimentScore: 75,
        sentimentLabel: 'positive',
      },
    });

    const res = await request.get('/api/v1/trends').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].topicLabel).toBe('\u5E7C\u7A1A\u5712\u9762\u8A66');
  });

  it('filters by source', async () => {
    const res = await request
      .get('/api/v1/trends?source=lihkg')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
