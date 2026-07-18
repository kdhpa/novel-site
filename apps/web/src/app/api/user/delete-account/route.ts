import { cookies } from 'next/headers';
import { after, NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@novelverse/db/client';
import { acquireUserPrivacyLocks } from '@novelverse/db';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, message } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { accountDeletionSchema } from '@/lib/server/validation';
import {
  authTokenIdentifier,
  consumeAuthToken,
} from '@/lib/server/auth-tokens';
import { cleanupStoredImageIfUnreferenced } from '@/lib/server/storage-cleanup';
import { findDeletedOwnedIllustrationPaths } from '@/lib/server/illustration-storage';
import { deleteFiles } from '@/lib/supabase';
import { logServerError, normalizeIdentityEmail } from '@novelverse/shared';
import {
  scrubJsonIdentifier,
  type JsonValue as PrivacyJsonValue,
} from '@/lib/server/privacy';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireUser();
    await Promise.all([
      assertRateLimit({ key: `account-delete:user:${sessionUser.id}`, limit: 5, windowMs: 24 * 60 * 60_000 }),
      assertRateLimit({ key: `account-delete:ip:${getClientIp(request)}`, limit: 10, windowMs: 24 * 60 * 60_000 }),
    ]);
    const body = accountDeletionSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 4 * 1024),
    );

    const deletedAccount = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('novelverse:admin-role-change'))::text
      `;
      await acquireUserPrivacyLocks(transaction, [sessionUser.id]);
      await transaction.$queryRaw`
        SELECT "id" FROM "users" WHERE "id" = ${sessionUser.id} FOR UPDATE
      `;
      const currentUser = await transaction.user.findUnique({
        where: { id: sessionUser.id },
        select: {
          id: true,
          email: true,
          password: true,
          role: true,
          image: true,
          novels: {
            select: {
              id: true,
              coverImage: true,
              chapters: { select: { id: true, content: true, aiImage: true } },
              characters: { select: { id: true, portraitUrl: true } },
            },
          },
          imageGenerationJobs: {
            select: { type: true, imageUrl: true, novelId: true },
          },
        },
      });
      if (!currentUser) throw new ApiError(404, '계정을 찾을 수 없습니다.');
      if (body.emailConfirmation !== normalizeIdentityEmail(currentUser.email)) {
        throw new ApiError(400, '계정 이메일이 일치하지 않습니다.');
      }

      if (currentUser.password) {
        const passwordValid = body.password
          ? await bcrypt.compare(body.password, currentUser.password)
          : false;
        if (!passwordValid) throw new ApiError(403, '현재 비밀번호가 올바르지 않습니다.');
      }

      const deletionTokenConsumed = await consumeAuthToken(
        transaction,
        'accountDeletion',
        currentUser.email,
        body.token,
      );
      if (!deletionTokenConsumed) {
        throw new ApiError(403, '계정 삭제 확인 토큰이 올바르지 않거나 만료되었습니다.');
      }

      if (currentUser.role === 'ADMIN') {
        const adminCount = await transaction.user.count({
          where: { role: 'ADMIN', suspendedAt: null },
        });
        if (adminCount <= 1) {
          throw new ApiError(409, '마지막 관리자는 계정을 삭제할 수 없습니다. 먼저 다른 관리자를 지정해 주세요.');
        }
      }

      await transaction.verificationToken.deleteMany({
        where: {
          identifier: {
            in: [
              authTokenIdentifier('emailVerification', currentUser.email),
              authTokenIdentifier('passwordReset', currentUser.email),
              authTokenIdentifier('accountDeletion', currentUser.email),
              authTokenIdentifier('accountExport', currentUser.email),
            ],
          },
        },
      });
      await transaction.adminAuditLog.updateMany({
        where: { targetType: 'user', targetId: currentUser.id },
        data: {
          message: '탈퇴 사용자와 관련된 비식별 감사 기록입니다.',
          metadata: {
            subjectAnonymized: true,
            anonymizedAt: new Date().toISOString(),
          },
        },
      });
      const metadataRows = await transaction.$queryRaw<Array<{
        id: string;
        metadata: Prisma.JsonValue;
      }>>`
        SELECT "id", "metadata"
        FROM "admin_audit_logs"
        WHERE "metadata" IS NOT NULL
          AND position(${currentUser.id} in "metadata"::text) > 0
        FOR UPDATE
      `;
      for (const row of metadataRows) {
        const metadata = scrubJsonIdentifier(
          row.metadata as PrivacyJsonValue,
          currentUser.id,
        ) as Prisma.InputJsonValue;
        await transaction.adminAuditLog.update({
          where: { id: row.id },
          data: { metadata },
          select: { id: true },
        });
      }
      await Promise.all([
        transaction.review.updateMany({
          where: { moderatedById: currentUser.id },
          data: { moderatedById: null },
        }),
        transaction.comment.updateMany({
          where: { moderatedById: currentUser.id },
          data: { moderatedById: null },
        }),
        transaction.contentReport.updateMany({
          where: { resolvedById: currentUser.id },
          data: { resolvedById: null },
        }),
      ]);
      await transaction.$executeRaw`
        UPDATE "content_reports"
        SET "targetSnapshot" = "targetSnapshot" - 'authorId'
        WHERE "targetSnapshot"->>'authorId' = ${currentUser.id}
      `;

      await transaction.user.delete({
        where: { id: currentUser.id },
        select: { id: true },
      });
      return currentUser;
    });

    after(async () => {
      const inlinePaths = deletedAccount.novels.flatMap((novel) =>
        novel.chapters.flatMap((chapter) =>
          findDeletedOwnedIllustrationPaths(chapter.content, '', {
            novelId: novel.id,
            chapterId: chapter.id,
          })
        )
      );
      if (inlinePaths.length) {
        const result = await deleteFiles('ILLUSTRATIONS', [...new Set(inlinePaths)]);
        if (!result.success) {
          logServerError(
            'account-delete.inline-cleanup',
            result.error || new Error('Storage cleanup failed'),
            { userId: deletedAccount.id },
          );
        }
      }

      const assets = new Map<string, {
        bucket: 'COVERS' | 'ILLUSTRATIONS' | 'PORTRAITS' | 'PROFILES';
        source: string | null | undefined;
        ownerFolders?: string[];
      }>();
      const addAsset = (
        bucket: 'COVERS' | 'ILLUSTRATIONS' | 'PORTRAITS' | 'PROFILES',
        source: string | null | undefined,
        ownerFolders?: string[],
      ) => {
        if (source) assets.set(`${bucket}:${source}`, { bucket, source, ownerFolders });
      };

      addAsset('PROFILES', deletedAccount.image, [deletedAccount.id]);
      for (const novel of deletedAccount.novels) {
        const owners = [novel.id, deletedAccount.id, `user-${deletedAccount.id}`];
        addAsset('COVERS', novel.coverImage, owners);
        for (const chapter of novel.chapters) {
          addAsset('ILLUSTRATIONS', chapter.aiImage, [...owners, chapter.id]);
        }
        for (const character of novel.characters) {
          addAsset('PORTRAITS', character.portraitUrl, [
            ...owners,
            `${novel.id}-${character.id}`,
          ]);
        }
      }
      for (const job of deletedAccount.imageGenerationJobs) {
        const bucket = job.type === 'cover'
          ? 'COVERS' as const
          : job.type === 'portrait'
            ? 'PORTRAITS' as const
            : 'ILLUSTRATIONS' as const;
        addAsset(bucket, job.imageUrl);
      }

      await Promise.all([...assets.values()].map((asset) =>
        cleanupStoredImageIfUnreferenced({
          ...asset,
          scope: 'account-delete.storage-cleanup',
        })
      ));
    });

    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.includes('authjs.session-token')) cookieStore.delete(cookie.name);
    }

    return message('계정과 연결된 데이터가 삭제되었습니다.', {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError(error, '계정을 삭제하지 못했습니다.');
  }
}
