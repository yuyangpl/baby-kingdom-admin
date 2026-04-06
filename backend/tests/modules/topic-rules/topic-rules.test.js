import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import TopicRule from '../../../src/modules/topic-rules/topic-rules.model.js';

let adminToken, ruleId;

beforeAll(async () => {
  await setupDB();
  await User.deleteMany({});
  await TopicRule.deleteMany({});

  await User.create({ username: 'admin', email: 'admin@test.com', password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  await User.deleteMany({});
  await TopicRule.deleteMany({});
  await teardownDB();
});

describe('TopicRule CRUD', () => {
  it('POST creates rule', async () => {
    const res = await request
      .post('/api/v1/topic-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ruleId: 'RULE-001',
        topicKeywords: ['IVF', '試管嬰兒', '備孕'],
        sensitivityTier: 1,
        sentimentTrigger: 'any',
        priorityAccountIds: ['BK003', 'BK006'],
        assignToneMode: 'SHARE_EXP',
        postTypePreference: 'new-post',
        geminiPromptHint: '強調過程而非結果',
        avoidIf: 'Skip if account has no IVF context',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.ruleId).toBe('RULE-001');
    expect(res.body.data.topicKeywords).toHaveLength(3);
    ruleId = res.body.data._id;
  });

  it('GET list returns rules', async () => {
    const res = await request.get('/api/v1/topic-rules').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /:id returns rule', async () => {
    const res = await request.get(`/api/v1/topic-rules/${ruleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ruleId).toBe('RULE-001');
  });

  it('PUT updates rule', async () => {
    const res = await request
      .put(`/api/v1/topic-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sensitivityTier: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.sensitivityTier).toBe(2);
  });

  it('DELETE removes rule', async () => {
    const res = await request.delete(`/api/v1/topic-rules/${ruleId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
