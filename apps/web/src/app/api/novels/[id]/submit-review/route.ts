import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertRateLimit({
      key: `review:submit:${user.id}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });

    const updatedNovel = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);

      const [novel, currentUser] = await Promise.all([
        transaction.novel.findUnique({
          where: { id },
          select: {
            id: true,
            authorId: true,
            approvalStatus: true,
            title: true,
            description: true,
            genres: true,
            seasonId: true,
            season: { select: { endsAt: true } },
            _count: { select: { chapters: true } },
          },
        }),
        transaction.user.findUnique({ where: { id: user.id }, select: { role: true } }),
      ]);

      if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
      if (novel.authorId !== user.id && currentUser?.role !== 'ADMIN') {
        throw new ApiError(403, '심사 요청 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(novel, {
        isAdmin: currentUser?.role === 'ADMIN',
      });
      if (novel.approvalStatus !== 'DRAFT' && novel.approvalStatus !== 'REJECTED') {
        throw new ApiError(409, '현재 상태에서는 심사를 요청할 수 없습니다.');
      }
      if (!novel.title.trim()) throw new ApiError(400, '제목을 입력해 주세요.');
      if (!novel.description?.trim()) throw new ApiError(400, '작품 소개를 입력해 주세요.');
      if (novel.genres.length === 0) throw new ApiError(400, '장르를 1개 이상 선택해 주세요.');
      if (novel._count.chapters === 0) {
        throw new ApiError(400, '회차를 1개 이상 작성한 뒤 심사를 요청해 주세요.');
      }

      return transaction.novel.update({
        where: { id },
        data: {
          approvalStatus: 'PENDING_REVIEW',
          isPublished: false,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          approvalNote: null,
        },
      });
    });

    return ok(updatedNovel);
  } catch (error) {
    return handleApiError(error, '심사 요청에 실패했습니다.');
  }
}
