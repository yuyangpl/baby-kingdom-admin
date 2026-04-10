import bcrypt from 'bcryptjs';
import { request, setupDB, teardownDB, cleanDB, expectSuccess, expectError } from '../../helpers.js';
import { getPrisma } from '../../../src/shared/database.js';
import { initQueues } from '../../../src/modules/queue/queue.service.js';

let adminToken: string;

beforeAll(async () => {
  await setupDB();
  initQueues();

  const prisma = getPrisma();
  const email = 'admin-queue@test.com';
  await prisma.user.deleteMany({ where: { email } });
  await prisma.user.create({
    data: { username: 'admin-queue', email, passwordHash: await bcrypt.hash('admin123', 12), role: 'admin' },
  });
  const res = await request.post('/api/v1/auth/login').send({ email, password: 'admin123' });
  adminToken = res.body.data.accessToken;
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email: 'admin-queue@test.com' } });
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
    expect(['running', 'idle']).toContain(status.body.data.status);
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
