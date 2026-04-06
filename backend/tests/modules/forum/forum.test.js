import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import Persona from '../../../src/modules/persona/persona.model.js';
import { ForumCategory, ForumBoard } from '../../../src/modules/forum/forum.model.js';

let adminToken, categoryId, boardId, personaId;

beforeAll(async () => {
  await setupDB();
  await User.deleteMany({});
  await ForumCategory.deleteMany({});
  await ForumBoard.deleteMany({});
  await Persona.deleteMany({});

  await User.create({ username: 'admin', email: 'admin@test.com', password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;

  const persona = await Persona.create({ accountId: 'BK001', username: 'testuser', archetype: 'pregnant' });
  personaId = persona._id.toString();
});

afterAll(async () => {
  await User.deleteMany({});
  await ForumCategory.deleteMany({});
  await ForumBoard.deleteMany({});
  await Persona.deleteMany({});
  await teardownDB();
});

describe('Forum Module', () => {
  it('POST /forums/categories creates category', async () => {
    const res = await request
      .post('/api/v1/forums/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '吹水玩樂', sortOrder: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('吹水玩樂');
    categoryId = res.body.data._id;
  });

  it('POST /forums/boards creates board', async () => {
    const res = await request
      .post('/api/v1/forums/boards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: '自由講場',
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
    boardId = res.body.data._id;
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
    expect(res.body.data[0].name).toBe('吹水玩樂');
    expect(res.body.data[0].boards).toHaveLength(1);
    expect(res.body.data[0].boards[0].name).toBe('自由講場');
    expect(res.body.data[0].boards[0].personaBindings).toHaveLength(1);
  });

  it('PUT /forums/boards/:id updates board config', async () => {
    const res = await request
      .put(`/api/v1/forums/boards/${boardId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enableScraping: false, note: '暫停抓取' });

    expect(res.status).toBe(200);
    expect(res.body.data.enableScraping).toBe(false);
    expect(res.body.data.note).toBe('暫停抓取');
  });

  it('PUT /forums/categories/:id updates category', async () => {
    const res = await request
      .put(`/api/v1/forums/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '吹水玩樂 v2' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('吹水玩樂 v2');
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
