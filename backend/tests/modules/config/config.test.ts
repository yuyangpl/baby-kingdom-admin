import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';

let adminToken: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await prisma.config.deleteMany({});

  // Use unique email to avoid conflicts with parallel test suites
  const email = 'admin-config@test.com';
  await prisma.user.deleteMany({ where: { email } });
  await prisma.user.create({
    data: { username: 'admin-config', email, passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' },
  });
  const res = await request.post('/api/v1/auth/login').send({ email, password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email: 'admin-config@test.com' } });
  await prisma.config.deleteMany({});
  await teardownDB();
});

describe('Config CRUD', () => {
  it('GET /api/v1/configs returns empty initially', async () => {
    const res = await request.get('/api/v1/configs').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('creates config entries and retrieves them', async () => {
    const prisma = getPrisma();
    await prisma.config.create({ data: { key: 'GEMINI_MODEL', value: 'gemini-2.5-flash', category: 'gemini', description: 'Model name' } });
    await prisma.config.create({ data: { key: 'GEMINI_API_KEY', value: '', category: 'gemini', description: 'API Key', isSecret: true } });

    const res = await request.get('/api/v1/configs/gemini').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);

    const model = res.body.data.find((c: any) => c.key === 'GEMINI_MODEL');
    expect(model.value).toBe('gemini-2.5-flash');
  });

  it('PUT /api/v1/configs/:key updates value', async () => {
    const res = await request
      .put('/api/v1/configs/GEMINI_MODEL')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'gemini-2.0-flash' });

    expect(res.status).toBe(200);

    const prisma = getPrisma();
    const updated = await prisma.config.findFirst({ where: { key: 'GEMINI_MODEL' } });
    expect(updated!.value).toBe('gemini-2.0-flash');
  });

  it('PUT /api/v1/configs/:key encrypts secret values', async () => {
    const res = await request
      .put('/api/v1/configs/GEMINI_API_KEY')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'sk-test-key-12345' });

    expect(res.status).toBe(200);

    // Raw value in DB should be encrypted
    const prisma = getPrisma();
    const raw = await prisma.config.findFirst({ where: { key: 'GEMINI_API_KEY' } });
    expect(raw!.value).not.toBe('sk-test-key-12345');
    expect(raw!.value).toContain(':'); // iv:encrypted format

    // API should mask the secret
    const listRes = await request.get('/api/v1/configs/gemini').set('Authorization', `Bearer ${adminToken}`);
    const secret = listRes.body.data.find((c: any) => c.key === 'GEMINI_API_KEY');
    expect(secret.value).toContain('••••••••');
    expect(secret.value).toContain('2345'); // last 4 chars
  });
});
