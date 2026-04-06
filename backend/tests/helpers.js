import supertest from 'supertest';
import { connectDB, disconnectDB } from '../src/shared/database.js';
import { connectRedis, disconnectRedis } from '../src/shared/redis.js';
import app from '../src/app.js';

export const request = supertest(app);

export async function setupDB() {
  await connectDB();
  await connectRedis();
}

export async function teardownDB() {
  await disconnectRedis();
  await disconnectDB();
}

export function expectSuccess(res, statusCode = 200) {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(true);
}

export function expectError(res, statusCode, code) {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe(code);
}
