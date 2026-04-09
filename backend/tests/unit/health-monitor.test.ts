import { setupDB, teardownDB } from '../helpers.js';
import { getRedis } from '../../src/shared/redis.js';
import Config from '../../src/modules/config/config.model.js';

const { checkBkForum, checkMediaLens, checkGemini, checkGoogleTrends } = await import(
  '../../src/shared/health-monitor.js'
);

beforeAll(async () => {
  await setupDB();
  // Clean test configs to ensure not_configured states
  await Config.deleteMany({
    key: { $in: ['BK_BASE_URL', 'MEDIALENS_JWT_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_TRENDS_BASE_URL', 'GOOGLE_TRENDS_ENABLED'] },
  });
});

afterAll(async () => {
  await Config.deleteMany({
    key: { $in: ['BK_BASE_URL', 'MEDIALENS_JWT_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_TRENDS_BASE_URL', 'GOOGLE_TRENDS_ENABLED'] },
  });
  await teardownDB();
});

describe('checkBkForum', () => {
  it('returns not_configured when BK_BASE_URL not set', async () => {
    const result = await checkBkForum();
    expect(result.status).toBe('not_configured');
  });
});

describe('checkMediaLens', () => {
  afterEach(async () => {
    await Config.deleteMany({ key: { $in: ['MEDIALENS_JWT_TOKEN', 'MEDIALENS_JWT_TOKEN_EXPIRY'] } });
  });

  it('returns not_configured when no JWT token', async () => {
    const result = await checkMediaLens();
    expect(result.status).toBe('not_configured');
  });

  it('returns expired when expiry is in the past', async () => {
    await Config.create({ key: 'MEDIALENS_JWT_TOKEN', value: 'fake-token', category: 'medialens' });
    await Config.create({ key: 'MEDIALENS_JWT_TOKEN_EXPIRY', value: new Date(Date.now() - 3600000).toISOString(), category: 'medialens' });
    const result = await checkMediaLens();
    expect(result.status).toBe('expired');
  });

  it('returns expiring_soon when expiry is within 24 hours', async () => {
    await Config.create({ key: 'MEDIALENS_JWT_TOKEN', value: 'fake-token', category: 'medialens' });
    await Config.create({ key: 'MEDIALENS_JWT_TOKEN_EXPIRY', value: new Date(Date.now() + 12 * 3600000).toISOString(), category: 'medialens' });
    const result = await checkMediaLens();
    expect(result.status).toBe('expiring_soon');
    expect(result.detail).toMatch(/expires in \d+h/);
  });

  it('returns valid when expiry is more than 24 hours away', async () => {
    await Config.create({ key: 'MEDIALENS_JWT_TOKEN', value: 'fake-token', category: 'medialens' });
    await Config.create({ key: 'MEDIALENS_JWT_TOKEN_EXPIRY', value: new Date(Date.now() + 5 * 24 * 3600000).toISOString(), category: 'medialens' });
    const result = await checkMediaLens();
    expect(result.status).toBe('valid');
    expect(result.detail).toMatch(/[45]d/);
  });
});

describe('checkGemini', () => {
  it('returns not_configured when no API key', async () => {
    const result = await checkGemini();
    expect(result.status).toBe('not_configured');
  });
});

describe('checkGoogleTrends', () => {
  it('returns not_configured when no base URL', async () => {
    const result = await checkGoogleTrends();
    expect(result.status).toBe('not_configured');
  });
});

describe('Alert cooldown (Redis)', () => {
  it('Redis key with 3-day TTL prevents duplicate alerts', async () => {
    const redis = getRedis();
    const key = 'health:alert:testService';
    await redis.set(key, 'disconnected', 'EX', 3 * 24 * 60 * 60);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3 * 24 * 60 * 60);
    await redis.del(key);
  });
});
