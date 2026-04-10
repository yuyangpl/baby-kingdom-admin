import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';

let adminToken: string, personaId: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await prisma.user.deleteMany({});
  await prisma.persona.deleteMany({});

  await prisma.user.create({ data: { username: 'admin', email: 'admin@test.com', passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' } });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({});
  await prisma.persona.deleteMany({});
  await teardownDB();
});

describe('Persona CRUD', () => {
  it('POST creates persona', async () => {
    const res = await request
      .post('/api/v1/personas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        accountId: 'BK001',
        username: 'hahabubu',
        archetype: 'pregnant',
        primaryToneMode: 'EMPATHISE',
        voiceCues: ['句首常用「唉」', '愛用省略號'],
        catchphrases: ['有冇人同我一樣…？'],
        topicBlacklist: ['離婚', '婆媳衝突'],
        maxPostsPerDay: 3,
        bkPassword: 'secret123',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.accountId).toBe('BK001');
    expect(res.body.data.bkPassword).toBe('••••••••'); // masked
    personaId = res.body.data._id || res.body.data.id;
  });

  it('GET list returns personas with masked passwords', async () => {
    const res = await request.get('/api/v1/personas').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].bkPassword).toBe('••••••••');
  });

  it('PUT updates persona', async () => {
    const res = await request
      .put(`/api/v1/personas/${personaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxPostsPerDay: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.maxPostsPerDay).toBe(5);
  });

  it('POST duplicate accountId returns 409', async () => {
    const res = await request
      .post('/api/v1/personas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ accountId: 'BK001', username: 'other', archetype: 'pregnant' });

    expect(res.status).toBe(409);
  });

  it('DELETE removes persona', async () => {
    const res = await request.delete(`/api/v1/personas/${personaId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
