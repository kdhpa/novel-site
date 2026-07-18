import { PrismaClient } from '@novelverse/db/runtime-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const cloudflareRequestClients = new WeakMap<object, PrismaClient>();

function positiveInteger(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isCloudflareWorkersRuntime() {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

function createPrismaClient(forCloudflareRequest = false) {
  const max = positiveInteger(process.env.DB_POOL_MAX || process.env.DATABASE_POOL_MAX)
    ?? (forCloudflareRequest ? 2 : 10);
  const maxUses = positiveInteger(process.env.DB_POOL_MAX_USES)
    ?? (forCloudflareRequest ? 1 : undefined);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    ...(maxUses ? { maxUses } : {}),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function getNodePrismaClient() {
  const client = globalForPrisma.prisma ?? createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

function getCloudflareRequestPrismaClient() {
  const { ctx } = getCloudflareContext();
  const requestContext = ctx as object;
  const existing = cloudflareRequestClients.get(requestContext);
  if (existing) return existing;

  const client = createPrismaClient(true);
  cloudflareRequestClients.set(requestContext, client);
  return client;
}

/**
 * Returns one Prisma client per Workers request. Node.js development, tests,
 * migrations, and conventional Next.js servers continue to share one client.
 */
export function getPrismaClient() {
  return isCloudflareWorkersRuntime()
    ? getCloudflareRequestPrismaClient()
    : getNodePrismaClient();
}

/**
 * Compatibility proxy for existing `prisma.model` call sites. Property access
 * is resolved lazily so no Pool or PrismaClient is created at module scope in a
 * Cloudflare Worker. Methods must be bound to their current request client.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
