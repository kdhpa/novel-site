import { PrismaClient } from '@novelverse/db/runtime-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function positiveInteger(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function createPrismaClient() {
  const max = positiveInteger(process.env.DB_POOL_MAX || process.env.DATABASE_POOL_MAX)
    ?? (process.env.VERCEL ? 2 : 10);
  const maxUses = positiveInteger(process.env.DB_POOL_MAX_USES);
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
  const pool = new Pool({
    connectionString,
    max,
    ...(maxUses ? { maxUses } : {}),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
  });
  if (process.env.VERCEL) {
    attachDatabasePool(pool);
  }
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export function getPrismaClient() {
  const client = globalForPrisma.prisma ?? createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

// Reuse one client per warm Node.js/Vercel function instance so repeated
// requests do not create a new PostgreSQL pool.
export const prisma = getPrismaClient();

export default prisma;
