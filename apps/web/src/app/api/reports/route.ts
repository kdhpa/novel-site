import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ApiError, fail, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { acquireUserPrivacyLocks } from '@novelverse/db';

const reportSchema = z.object({
  targetType: z.enum(['comment', 'review']),
  targetId: z.string().trim().min(1).max(100),
  reason: z.enum(['spam', 'harassment', 'copyright', 'privacy', 'other']),
  details: z.string().trim().max(1000).optional(),
}).strict();

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null &&
    (error as { code?: string }).code === 'P2002';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    await assertRateLimit({
      key: `content-report:${user.id}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    const body = reportSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 8 * 1024)
    );

    const initialTarget = body.targetType === 'comment'
      ? await prisma.comment.findFirst({
          where: {
            id: body.targetId,
            isHidden: false,
            novel: { isPublished: true, approvalStatus: 'APPROVED' },
          },
          select: { userId: true },
        })
      : await prisma.review.findFirst({
          where: {
            id: body.targetId,
            isHidden: false,
            novel: { isPublished: true, approvalStatus: 'APPROVED' },
          },
          select: { userId: true },
        });
    if (!initialTarget) throw new ApiError(404, '신고할 콘텐츠를 찾을 수 없습니다.');
    const targetUserId = initialTarget.userId;

    if (targetUserId === user.id) throw new ApiError(400, '자신의 콘텐츠는 신고할 수 없습니다.');

    const report = await prisma.$transaction(async (transaction) => {
      await acquireUserPrivacyLocks(transaction, [user.id, targetUserId]);
      const [reporter, target] = await Promise.all([
        transaction.user.findFirst({
          where: { id: user.id, suspendedAt: null },
          select: { id: true },
        }),
        body.targetType === 'comment'
          ? transaction.comment.findFirst({
              where: {
                id: body.targetId,
                isHidden: false,
                novel: { isPublished: true, approvalStatus: 'APPROVED' },
              },
              select: {
                id: true,
                userId: true,
                novelId: true,
                chapterId: true,
                parentId: true,
                content: true,
                createdAt: true,
              },
            })
          : transaction.review.findFirst({
              where: {
                id: body.targetId,
                isHidden: false,
                novel: { isPublished: true, approvalStatus: 'APPROVED' },
              },
              select: {
                id: true,
                userId: true,
                novelId: true,
                rating: true,
                hasSpoiler: true,
                content: true,
                createdAt: true,
              },
            }),
      ]);
      if (!reporter || !target || target.userId !== targetUserId) {
        throw new ApiError(409, '계정 또는 신고 대상 상태가 변경되었습니다. 다시 시도해 주세요.');
      }

      const targetSnapshot = body.targetType === 'comment' && 'parentId' in target
        ? {
            authorId: target.userId,
            novelId: target.novelId,
            chapterId: target.chapterId,
            parentId: target.parentId,
            content: target.content.slice(0, 1_000),
            createdAt: target.createdAt.toISOString(),
          }
        : {
            authorId: target.userId,
            novelId: target.novelId,
            rating: 'rating' in target ? target.rating : null,
            hasSpoiler: 'hasSpoiler' in target ? target.hasSpoiler : null,
            content: target.content.slice(0, 2_000),
            createdAt: target.createdAt.toISOString(),
          };

      return transaction.contentReport.create({
        data: {
          reporterId: reporter.id,
          targetType: body.targetType,
          targetId: body.targetId,
          reason: body.reason,
          details: body.details || null,
          targetSnapshot,
        },
        select: { id: true, status: true, createdAt: true },
      });
    });
    return ok(report, { status: 201 });
  } catch (error) {
    if (isUniqueConflict(error)) return fail(409, '이미 신고한 콘텐츠입니다.');
    return handleApiError(error, '신고를 접수하지 못했습니다.');
  }
}
