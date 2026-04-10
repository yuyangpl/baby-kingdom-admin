import { request, setupDB, teardownDB, cleanDB } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';
import bcrypt from 'bcryptjs';

let adminToken: string, categoryId: string, boardId: string, personaId: string;

beforeAll(async () => {
  await setupDB();
  const prisma = getPrisma();
  await cleanDB();

  await prisma.user.create({ data: { username: 'admin', email: 'admin@test.com', passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' } });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;

  const persona = await prisma.persona.create({ data: { accountId: 'BK001', username: 'testuser', archetype: 'pregnant' } });
  personaId = persona.id;
});

afterAll(async () => {
  await cleanDB();
  await teardownDB();
});

describe('Forum Module', () => {
  it('POST /forums/categories creates category', async () => {
    const res = await request
      .post('/api/v1/forums/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '\u5439\u6C34\u73A9\u6A02', sortOrder: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('\u5439\u6C34\u73A9\u6A02');
    categoryId = res.body.data._id || res.body.data.id;
  });

  it('POST /forums/boards creates board', async () => {
    const res = await request
      .post('/api/v1/forums/boards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: '\u81EA\u7531\u8B1B\u5834',
        fid: 162,
        enableScraping: true,
        enableAutoReply: true,
        replyThreshold: { min: 0, max: 40 },
        scanInterval: 30,
        defaultToneMode: 'CASUAL',
        sensitivityTier: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.fid).toBe(162);
    expect(res.body.data.enableScraping).toBe(true);
    boardId = res.body.data._id || res.body.data.id;
  });

  it('PUT /forums/boards/:id/personas sets persona bindings', async () => {
    const res = await request
      .put(`/api/v1/forums/boards/${boardId}/personas`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        personaBindings: [
          { personaId, toneMode: 'EMPATHISE', weight: 'high', dailyLimit: 5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.personaBindings).toHaveLength(1);
    expect(res.body.data.personaBindings[0].weight).toBe('high');
    expect(res.body.data.personaBindings[0].dailyLimit).toBe(5);
  });

  it('GET /forums returns tree with categories and boards', async () => {
    const res = await request.get('/api/v1/forums').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('\u5439\u6C34\u73A9\u6A02');
    expect(res.body.data[0].boards).toHaveLength(1);
    expect(res.body.data[0].boards[0].name).toBe('\u81EA\u7531\u8B1B\u5834');
    expect(res.body.data[0].boards[0].personaBindings).toHaveLength(1);
  });

  it('PUT /forums/boards/:id updates board config', async () => {
    const res = await request
      .put(`/api/v1/forums/boards/${boardId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enableScraping: false, note: '\u66AB\u505C\u6293\u53D6' });

    expect(res.status).toBe(200);
    expect(res.body.data.enableScraping).toBe(false);
    expect(res.body.data.note).toBe('\u66AB\u505C\u6293\u53D6');
  });

  it('PUT /forums/categories/:id updates category', async () => {
    const res = await request
      .put(`/api/v1/forums/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '\u5439\u6C34\u73A9\u6A02 v2' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('\u5439\u6C34\u73A9\u6A02 v2');
  });

  it('DELETE /forums/boards/:id removes board', async () => {
    const res = await request
      .delete(`/api/v1/forums/boards/${boardId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const tree = await request.get('/api/v1/forums').set('Authorization', `Bearer ${adminToken}`);
    expect(tree.body.data[0].boards).toHaveLength(0);
  });
});
