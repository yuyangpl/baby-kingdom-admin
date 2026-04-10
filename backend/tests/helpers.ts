import supertest from 'supertest';
import { connectDB, disconnectDB, getPrisma } from '../src/shared/database.js';
import { initQueues } from '../src/modules/queue/queue.service.js';
import app from '../src/app.js';

export const request = supertest(app as any);

export async function setupDB(): Promise<void> {
  await connectDB();
  initQueues();
}

export async function teardownDB(): Promise<void> {
  await disconnectDB();
}

/**
 * Clean all tables in the test database.
 * Respects foreign key constraints by deleting in correct order.
 */
export async function cleanDB(): Promise<void> {
  const prisma = getPrisma();
  // Delete in FK-dependency order (children first)
  await prisma.googleTrendNews.deleteMany({});
  await prisma.boardPersonaBinding.deleteMany({});
  await prisma.tokenBlacklist.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.queueJob.deleteMany({});
  await prisma.dailyStats.deleteMany({});
  await prisma.feed.deleteMany({});
  await prisma.googleTrend.deleteMany({});
  await prisma.trend.deleteMany({});
  await prisma.forumBoard.deleteMany({});
  await prisma.forumCategory.deleteMany({});
  await prisma.persona.deleteMany({});
  await prisma.topicRule.deleteMany({});
  await prisma.toneMode.deleteMany({});
  await prisma.config.deleteMany({});
  await prisma.user.deleteMany({});
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
