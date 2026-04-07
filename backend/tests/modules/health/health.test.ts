import { request, expectSuccess, setupDB, teardownDB } from '../../helpers.js';

beforeAll(async () => {
  await setupDB();
});

afterAll(async () => {
  await teardownDB();
});

describe('GET /api/health', () => {
  it('returns healthy status when MongoDB and Redis are connected', async () => {
    const res = await request.get('/api/health');

    expectSuccess(res);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.services.mongodb).toBe('connected');
    expect(res.body.data.services.redis).toBe('connected');
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.data.timestamp).toBeDefined();
  });
});

describe('GET /api/nonexistent', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request.get('/api/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/health/services', () => {
  it('returns 4 service statuses', async () => {
    const res = await request.get('/api/health/services');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('bkForum');
    expect(res.body.data).toHaveProperty('mediaLens');
    expect(res.body.data).toHaveProperty('gemini');
    expect(res.body.data).toHaveProperty('googleTrends');
    expect(res.body.data.bkForum.status).toBe('not_configured');
    expect(res.body.data.bkForum.checkedAt).toBeDefined();
  });
});
