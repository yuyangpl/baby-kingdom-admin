import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import DailyStats from '../../../src/modules/dashboard/dashboard.model.js';

let adminToken: string;

beforeAll(async () => {
  await setupDB();
  await DailyStats.deleteMany({});

  const email = 'admin-dashboard@test.com';
  await User.findOneAndDelete({ email });
  await User.create({ username: 'admin-dash', email, password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email, password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  await User.findOneAndDelete({ email: 'admin-dashboard@test.com' });
  await DailyStats.deleteMany({});
  await teardownDB();
});

describe('Dashboard', () => {
  it('GET /dashboard/realtime returns queue and pending data', async () => {
    const res = await request.get('/api/v1/dashboard/realtime').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pendingFeeds).toBeDefined();
  });

  it('GET /dashboard/today returns today stats', async () => {
    const res = await request.get('/api/v1/dashboard/today').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBeDefined();
  });

  it('GET /dashboard/recent returns recent activity', async () => {
    const res = await request.get('/api/v1/dashboard/recent').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.feeds).toBeDefined();
    expect(res.body.data.jobs).toBeDefined();
  });

  it('GET /dashboard/weekly returns 7-day stats', async () => {
    // Seed some daily stats
    const today = new Date().toISOString().slice(0, 10);
    await DailyStats.create({
      date: today,
      feeds: { generated: 10, approved: 8, rejected: 2, posted: 7, failed: 1 },
    });

    const res = await request.get('/api/v1/dashboard/weekly').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
