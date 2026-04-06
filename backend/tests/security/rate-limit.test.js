/**
 * Rate limit tests.
 * Uses a dedicated mini express app with rate limiters force-enabled
 * (bypassing the NODE_ENV=test no-op) so existing tests are unaffected.
 */
import express from 'express';
import supertest from 'supertest';
import { createRateLimit } from '../../src/shared/middleware/rate-limit.js';

// Build a tiny app with a strict login-like limiter (max: 5 per window)
function buildTestApp(max = 5) {
  const app = express();
  app.use(express.json());

  // Force-enable the limiter even in NODE_ENV=test
  const limiter = createRateLimit(
    { windowMs: 60 * 1000, max },
    true, // forceEnable
  );

  app.post('/login', limiter, (_req, res) => {
    res.json({ success: true, data: { token: 'fake' } });
  });

  return supertest(app);
}

describe('Rate Limiting', () => {
  it('allows requests up to the limit', async () => {
    const request = buildTestApp(5);

    // Send exactly `max` requests — all should succeed
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/login').send({ email: 'x', password: 'y' });
      expect(res.status).toBe(200);
    }
  });

  it('blocks the (max+1)th request with 429', async () => {
    const request = buildTestApp(5);

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await request.post('/login').send({ email: 'x', password: 'y' });
    }

    // The 6th request must be rate-limited
    const res = await request.post('/login').send({ email: 'x', password: 'y' });
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
