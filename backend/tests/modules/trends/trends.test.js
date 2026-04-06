import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Trend from '../../../src/modules/trends/trends.model.js';
import Config from '../../../src/modules/config/config.model.js';

let adminToken;

beforeAll(async () => {
  await setupDB();
  await User.deleteMany({});
  await Trend.deleteMany({});
  await Config.deleteMany({});

  await User.create({ username: 'admin', email: 'admin@test.com', password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  await User.deleteMany({});
  await Trend.deleteMany({});
  await Config.deleteMany({});
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
    await Trend.create({
      pullId: 'PULL-TEST-001',
      source: 'medialens',
      rank: 1,
      topicLabel: '幼稚園面試',
      summary: '好多家長都緊張',
      engagements: 5000,
      postCount: 200,
      sensitivityTier: 1,
      sentimentScore: 75,
      sentimentLabel: 'positive',
    });

    const res = await request.get('/api/v1/trends').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].topicLabel).toBe('幼稚園面試');
  });

  it('filters by source', async () => {
    const res = await request
      .get('/api/v1/trends?source=lihkg')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
