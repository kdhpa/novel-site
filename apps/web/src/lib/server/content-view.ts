import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { Prisma } from '@novelverse/db/client';
import { logServerError } from '@novelverse/shared';
import {
  getTrustedClientIp,
  normalizeClientIpAddress,
} from '@novelverse/shared/proxy';
import prisma from '@/lib/prisma';

export type ContentViewTargetType = 'novel' | 'chapter';

type HeaderReader = {
  get(name: string): string | null;
};

type RecordContentViewInput = {
  targetType: ContentViewTargetType;
  targetId: string;
  userId?: string | null;
  headers: HeaderReader;
  now?: Date;
};

type PersistContentViewInput = {
  targetType: ContentViewTargetType;
  targetId: string;
  viewerHash: string;
  bucketStart: Date;
  viewId?: string;
};

const MAX_USER_AGENT_LENGTH = 512;
const DEFAULT_RETENTION_DAYS = 90;
const PRUNE_SAMPLE_SIZE = 1_000;

export const normalizeIpAddress = normalizeClientIpAddress;

export function getContentViewClientIp(headers: HeaderReader) {
  return getTrustedClientIp(headers);
}

export function getUtcViewBucket(date: Date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

export function createContentViewerHash(input: {
  targetType: ContentViewTargetType;
  targetId: string;
  bucketStart: Date;
  userId?: string | null;
  headers: HeaderReader;
  secret: string;
}) {
  if (!input.secret) throw new Error('조회수 식별자 해시에 사용할 인증 시크릿이 없습니다.');

  const identity = input.userId
    ? `user:${input.userId}`
    : `anonymous:${getContentViewClientIp(input.headers)}\n${(
        input.headers.get('user-agent') || 'unknown'
      ).trim().slice(0, MAX_USER_AGENT_LENGTH)}`;

  const scopedIdentity = [
    'v2',
    input.bucketStart.toISOString(),
    `${input.targetType}:${input.targetId}`,
    identity,
  ].join('\n');

  return createHmac('sha256', input.secret).update(scopedIdentity).digest('hex');
}

function getContentViewSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET 또는 AUTH_SECRET 설정이 필요합니다.');
  return secret;
}

export async function insertUniqueContentViewAndIncrement(
  transaction: Prisma.TransactionClient,
  input: PersistContentViewInput,
) {
  const inserted = await transaction.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "content_views" (
      "id",
      "targetType",
      "targetId",
      "viewerHash",
      "bucketStart",
      "createdAt"
    )
    VALUES (
      ${input.viewId || randomUUID()},
      ${input.targetType},
      ${input.targetId},
      ${input.viewerHash},
      ${input.bucketStart},
      NOW()
    )
    ON CONFLICT ("targetType", "targetId", "viewerHash", "bucketStart")
    DO NOTHING
    RETURNING "id"
  `;

  if (inserted.length === 0) return false;

  if (input.targetType === 'novel') {
    await transaction.novel.update({
      where: { id: input.targetId },
      data: { viewCount: { increment: 1 } },
      select: { id: true },
    });
  } else {
    await transaction.chapter.update({
      where: { id: input.targetId },
      data: { viewCount: { increment: 1 } },
      select: { id: true },
    });
  }

  return true;
}

export async function recordUniqueContentView(input: RecordContentViewInput) {
  const now = input.now || new Date();
  const bucketStart = getUtcViewBucket(now);
  const viewerHash = createContentViewerHash({
    targetType: input.targetType,
    targetId: input.targetId,
    bucketStart,
    userId: input.userId,
    headers: input.headers,
    secret: getContentViewSecret(),
  });

  const recorded = await prisma.$transaction((transaction) => insertUniqueContentViewAndIncrement(transaction, {
    targetType: input.targetType,
    targetId: input.targetId,
    viewerHash,
    bucketStart,
  }));

  if (randomInt(PRUNE_SAMPLE_SIZE) === 0) {
    const configuredDays = Number.parseInt(process.env.CONTENT_VIEW_RETENTION_DAYS || '', 10);
    const retentionDays = Number.isFinite(configuredDays)
      ? Math.min(365, Math.max(7, configuredDays))
      : DEFAULT_RETENTION_DAYS;
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      await prisma.contentView.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (error) {
      logServerError('content-view-prune', error);
    }
  }

  return recorded;
}
