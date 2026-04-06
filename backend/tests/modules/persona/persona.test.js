import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';

let adminToken, personaId;

beforeAll(async () => {
  await setupDB();
  await User.deleteMany({});
  await Persona.deleteMany({});

  await User.create({ username: 'admin', email: 'admin@test.com', password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  await User.deleteMany({});
  await Persona.deleteMany({});
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
    personaId = res.body.data._id;
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
