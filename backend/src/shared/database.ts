import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import logger from './logger.js';

let prisma: PrismaClient;
let pool: pg.Pool;
let isConnected = false;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const dbUrl = process.env.DATABASE_URL || '';
    // Cloud SQL Unix socket: extract host param from query string for pg Pool
    const url = new URL(dbUrl);
    const socketPath = url.searchParams.get('host');
    const poolConfig: pg.PoolConfig = socketPath
      ? {
          user: url.username,
          password: decodeURIComponent(url.password),
          database: url.pathname.slice(1),
          host: socketPath,
        }
      : { connectionString: dbUrl };

    pool = new pg.Pool(poolConfig);
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter } as any);
  }
  return prisma;
}

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  const client = getPrisma();
  await client.$connect();
  isConnected = true;
  logger.info('PostgreSQL connected via Prisma');
}

export async function disconnectDB(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
  if (pool) {
    await pool.end();
  }
  isConnected = false;
}

export function isDBConnected(): boolean {
  return isConnected;
}

// Use getPrisma() instead of direct import — the client is only initialized after getPrisma() is called
