import Redis from 'ioredis';
import logger from './logger.js';

let client: Redis.Redis | null = null;

export function getRedis(): Redis.Redis {
  if (client) return client;

  client = new Redis.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err: Error) => logger.error({ err }, 'Redis connection error'));

  return client;
}

export async function connectRedis(): Promise<Redis.Redis> {
  const redis = getRedis();
  if (redis.status === 'ready') return redis;
  return new Promise((resolve, reject) => {
    redis.once('ready', () => resolve(redis));
    redis.once('error', reject);
  });
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

export function isRedisConnected(): boolean {
  return client !== null && client.status === 'ready';
}
