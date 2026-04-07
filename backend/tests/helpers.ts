import supertest from 'supertest';
import { connectDB, disconnectDB } from '../src/shared/database.js';
import { connectRedis, disconnectRedis } from '../src/shared/redis.js';
import app from '../src/app.js';

export const request = supertest(app as any);

export async function setupDB(): Promise<void> {
  await connectDB();
  await connectRedis();
}

export async function teardownDB(): Promise<void> {
  await disconnectRedis();
  await disconnectDB();
}

export function expectSuccess(res: supertest.Response, statusCode = 200): void {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(true);
}

export function expectError(res: supertest.Response, statusCode: number, code: string): void {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe(code);
}
