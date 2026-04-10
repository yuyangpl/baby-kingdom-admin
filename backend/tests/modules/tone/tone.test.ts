import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';

let adminToken: string, editorToken: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await prisma.user.deleteMany({});
  await prisma.toneMode.deleteMany({});

  await prisma.user.create({ data: { username: 'admin', email: 'admin@test.com', passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' } });
  await prisma.user.create({ data: { username: 'editor', email: 'editor@test.com', passwordHash: await bcrypt.hash('editor123', 12), role: 'editor' } });

  const adminRes = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = adminRes.body.data.accessToken;

  const editorRes = await request.post('/api/v1/auth/login').send({ email: 'editor@test.com', password: 'editor123' });
  editorToken = editorRes.body.data.accessToken;
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({});
  await prisma.toneMode.deleteMany({});
  await teardownDB();
});

let toneId: string;

describe('ToneMode CRUD', () => {
  it('POST creates a tone mode (admin)', async () => {
    const res = await request
      .post('/api/v1/tones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        toneId: 'EMPATHISE',
        displayName: '同理共感',
        whenToUse: 'Tier 2-3, negative sentiment',
        emotionalRegister: 'Warm, understanding',
        openingStyle: '先表達理解',
        sentenceStructure: '短句，留白',
        whatToAvoid: '不要說教',
        exampleOpening: '明白你嘅感受…',
        suitableForTier3: true,
        overridePriority: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.toneId).toBe('EMPATHISE');
    expect(res.body.data.displayName).toBe('同理共感');
    toneId = res.body.data._id || res.body.data.id;
  });

  it('POST editor cannot create', async () => {
    const res = await request
      .post('/api/v1/tones')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ toneId: 'X', displayName: 'X' });
    expect(res.status).toBe(403);
  });

  it('GET list returns tone modes', async () => {
    const res = await request.get('/api/v1/tones').set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('GET /:id returns single tone mode', async () => {
    const res = await request.get(`/api/v1/tones/${toneId}`).set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.toneId).toBe('EMPATHISE');
  });

  it('PUT updates tone mode', async () => {
    const res = await request
      .put(`/api/v1/tones/${toneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displayName: '同理共感 v2' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('同理共感 v2');
  });

  it('DELETE removes tone mode', async () => {
    const res = await request.delete(`/api/v1/tones/${toneId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const check = await request.get(`/api/v1/tones/${toneId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(check.status).toBe(404);
  });
});
