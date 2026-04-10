import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';

let adminToken: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await prisma.auditLog.deleteMany({});
  await prisma.toneMode.deleteMany({});
  await prisma.user.deleteMany({});

  await prisma.user.create({ data: { username: 'admin', email: 'admin@test.com', passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' } });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.auditLog.deleteMany({});
  await prisma.toneMode.deleteMany({});
  await prisma.user.deleteMany({});
  await teardownDB();
});

describe('Audit Log', () => {
  it('CRUD operations create audit log entries', async () => {
    // Create a tone mode (triggers audit log)
    await request
      .post('/api/v1/tones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toneId: 'TEST_TONE', displayName: 'Test' });

    // Check audit log
    const res = await request.get('/api/v1/audits').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const createLog = res.body.data.find((l: any) => l.eventType === 'TONE_CREATED');
    expect(createLog).toBeDefined();
    expect(createLog.module).toBe('tone');
  });

  it('GET /api/v1/audits supports filtering by module', async () => {
    const res = await request
      .get('/api/v1/audits?module=tone')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach((log: any) => {
      expect(log.module).toBe('tone');
    });
  });

  it('editor cannot access audit logs', async () => {
    const prisma = getPrisma();
    await prisma.user.create({ data: { username: 'editor', email: 'editor@test.com', passwordHash: await bcrypt.hash('editor123', 12), role: 'editor' } });
    const editorRes = await request.post('/api/v1/auth/login').send({ email: 'editor@test.com', password: 'editor123' });

    const res = await request.get('/api/v1/audits').set('Authorization', `Bearer ${editorRes.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });
});
