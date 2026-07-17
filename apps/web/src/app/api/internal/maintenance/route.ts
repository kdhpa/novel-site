import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runImageJobMaintenance } from '@/lib/server/image-generation-jobs';
import { logServerError } from '@novelverse/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 1_000;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 32) return null;

  const provided = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(providedBytes, expectedBytes);
}

function retentionDays(name: string, fallback: number, minimum = 7, maximum = 365) {
  const configured = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(configured)
    ? Math.min(maximum, Math.max(minimum, configured))
    : fallback;
}

async function deleteExpiredRows(now: Date) {
  const contentCutoff = new Date(
    now.getTime() - retentionDays('CONTENT_VIEW_RETENTION_DAYS', 90) * 24 * 60 * 60 * 1000
  );
  const staleBucketCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const moderationCutoff = new Date(
    now.getTime() -
      retentionDays('MODERATION_RECORD_RETENTION_DAYS', 365, 30, 3_650) *
        24 * 60 * 60 * 1000
  );

  const [contentViews, rateBuckets, verificationTokens, resolvedReports, auditLogs] =
    await Promise.all([
      prisma.contentView.findMany({
        where: { createdAt: { lt: contentCutoff } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_BATCH_SIZE,
        select: { id: true },
      }),
      prisma.rateLimitBucket.findMany({
        where: { resetAt: { lt: staleBucketCutoff } },
        orderBy: { resetAt: 'asc' },
        take: MAX_BATCH_SIZE,
        select: { key: true },
      }),
      prisma.verificationToken.findMany({
        where: { expires: { lt: now } },
        orderBy: { expires: 'asc' },
        take: MAX_BATCH_SIZE,
        select: { token: true },
      }),
      prisma.contentReport.findMany({
        where: { resolvedAt: { lt: moderationCutoff } },
        orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
        take: MAX_BATCH_SIZE,
        select: { id: true },
      }),
      prisma.adminAuditLog.findMany({
        where: { createdAt: { lt: moderationCutoff } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_BATCH_SIZE,
        select: { id: true },
      }),
    ]);

  const [removedViews, removedBuckets, removedTokens, removedReports, removedAuditLogs] =
    await prisma.$transaction([
      prisma.contentView.deleteMany({
        where: {
          id: { in: contentViews.map((row) => row.id) },
          createdAt: { lt: contentCutoff },
        },
      }),
      prisma.rateLimitBucket.deleteMany({
        where: {
          key: { in: rateBuckets.map((row) => row.key) },
          resetAt: { lt: staleBucketCutoff },
        },
      }),
      prisma.verificationToken.deleteMany({
        where: {
          token: { in: verificationTokens.map((row) => row.token) },
          expires: { lt: now },
        },
      }),
      prisma.contentReport.deleteMany({
        where: {
          id: { in: resolvedReports.map((row) => row.id) },
          resolvedAt: { lt: moderationCutoff },
        },
      }),
      prisma.adminAuditLog.deleteMany({
        where: {
          id: { in: auditLogs.map((row) => row.id) },
          createdAt: { lt: moderationCutoff },
        },
      }),
    ]);

  return {
    contentViews: removedViews.count,
    rateLimitBuckets: removedBuckets.count,
    verificationTokens: removedTokens.count,
    resolvedReports: removedReports.count,
    adminAuditLogs: removedAuditLogs.count,
  };
}

async function reconcileNovelLikeCounts() {
  return prisma.$transaction(
    async (tx) => {
      // Serialize novel writes while retaining ordinary reads. A concurrent like
      // mutation remains uncommitted while its counter trigger waits on this lock,
      // so the snapshot sees the previous like version and the queued trigger
      // applies its delta after this reconciliation commits.
      await tx.$executeRaw`LOCK TABLE novels IN SHARE ROW EXCLUSIVE MODE`;
      return tx.$executeRaw`
        UPDATE novels n
        SET "likeCount" = counts.value
        FROM (
          SELECT n2.id, COUNT(l.id)::INTEGER AS value
          FROM novels n2
          LEFT JOIN likes l ON l."novelId" = n2.id
          GROUP BY n2.id
        ) counts
        WHERE counts.id = n.id
          AND n."likeCount" IS DISTINCT FROM counts.value
      `;
    },
    { timeout: 30_000 }
  );
}

async function handleMaintenance(request: NextRequest) {
  const isAuthorized = authorized(request);
  if (isAuthorized === null) {
    return NextResponse.json(
      { success: false, error: 'Maintenance endpoint is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const now = new Date();
    const [rows, imageJobs, reconciledLikeCounts] = await Promise.all([
      deleteExpiredRows(now),
      runImageJobMaintenance(now, { force: true }),
      reconcileNovelLikeCounts(),
    ]);
    return NextResponse.json(
      { success: true, data: { ...rows, imageJobs, reconciledLikeCounts } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logServerError('maintenance', error);
    return NextResponse.json(
      { success: false, error: 'Maintenance failed.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleMaintenance(request);
}

export async function POST(request: NextRequest) {
  return handleMaintenance(request);
}
