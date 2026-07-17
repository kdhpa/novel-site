import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const configuredMax = Number(process.env.DB_POOL_MAX || process.env.DATABASE_POOL_MAX);
  const max = Number.isInteger(configuredMax) && configuredMax > 0 ? configuredMax : 10;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;

export default prisma;
