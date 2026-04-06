import { request, setupDB, teardownDB } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';
import { initQueues } from '../../../src/modules/queue/queue.service.js';

let adminToken;

beforeAll(async () => {
  await setupDB();
  initQueues();

  const email = 'admin-queue@test.com';
  await User.findOneAndDelete({ email });
  await User.create({ username: 'admin-queue', email, password: 'admin123', role: 'admin' });
  const res = await request.post('/api/v1/auth/login').send({ email, password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  await User.findOneAndDelete({ email: 'admin-queue@test.com' });
  await teardownDB();
});

describe('Queue Management', () => {
  it('GET /queues returns all queue statuses', async () => {
    const res = await request.get('/api/v1/queues').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(6); // 6 queues
    expect(res.body.data[0].name).toBeDefined();
    expect(res.body.data[0].status).toBeDefined();
  });

  it('GET /queues/:name returns single queue status', async () => {
    const res = await request.get('/api/v1/queues/scanner').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('scanner');
    expect(res.body.data.counts).toBeDefined();
  });

  it('POST /queues/:name/pause pauses a queue', async () => {
    const res = await request.post('/api/v1/queues/scanner/pause').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const status = await request.get('/api/v1/queues/scanner').set('Authorization', `Bearer ${adminToken}`);
    expect(status.body.data.status).toBe('paused');
  });

  it('POST /queues/:name/resume resumes a queue', async () => {
    const res = await request.post('/api/v1/queues/scanner/resume').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const status = await request.get('/api/v1/queues/scanner').set('Authorization', `Bearer ${adminToken}`);
    expect(status.body.data.status).toBe('running');
  });

  it('POST /queues/:name/trigger adds a manual job', async () => {
    const res = await request.post('/api/v1/queues/scanner/trigger').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.jobId).toBeDefined();
    expect(res.body.data.queueName).toBe('scanner');
  });

  it('GET /queues/:name/jobs returns job history', async () => {
    const res = await request.get('/api/v1/queues/scanner/jobs').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});
