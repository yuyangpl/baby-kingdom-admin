import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import logger from './logger.js';

let prisma: PrismaClient;
let isConnected = false;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' } as const]
        : [{ emit: 'event', level: 'error' } as const],
    } as any);

    prisma.$on('query' as never, (e: any) => {
      if (process.env.NODE_ENV === 'development' && process.env.LOG_QUERIES === 'true') {
        logger.debug({ query: e.query, duration: e.duration }, 'Prisma query');
      }
    });
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
  isConnected = false;
}

export function isDBConnected(): boolean {
  return isConnected;
}

// Use getPrisma() instead of direct import — the client is only initialized after getPrisma() is called
