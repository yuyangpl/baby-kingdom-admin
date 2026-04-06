import Redis from 'ioredis';
import logger from './logger.js';

let client = null;

export function getRedis() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null, // required by BullMQ
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));

  return client;
}

export async function connectRedis() {
  const redis = getRedis();
  if (redis.status === 'ready') return redis;
  return new Promise((resolve, reject) => {
    redis.once('ready', () => resolve(redis));
    redis.once('error', reject);
  });
}

export async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

export function isRedisConnected() {
  return client?.status === 'ready';
}
