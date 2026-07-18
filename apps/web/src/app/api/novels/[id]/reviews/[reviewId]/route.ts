import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, message, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { reviewPatchSchema } from '@/lib/server/validation';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';

type RouteParams = {
  params: Promise<{ id: string; reviewId: string }>;
};

async function getReview(novelId: string, reviewId: string) {
  const review = await prisma.review.findFirst({
    where: {
      id: reviewId,
      novelId,
    },
    select: {
      id: true,
      userId: true,
      novelId: true,
      isHidden: true,
    },
  });

  if (!review) {
    throw new ApiError(404, '리뷰를 찾을 수 없습니다.');
  }

  return review;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id, reviewId } = await params;
    await assertRateLimit({ key: `review:write:${user.id}`, limit: 20, windowMs: 15 * 60_000 });
    const review = await getReview(id, reviewId);
    if (user.id !== review.userId) {
      throw new ApiError(403, '리뷰 수정 권한이 없습니다.');
    }
    if (review.isHidden) throw new ApiError(409, '운영 검토로 숨겨진 리뷰는 수정할 수 없습니다.');

    const body = reviewPatchSchema.parse(await readJsonBodyWithLimit<unknown>(request, 8 * 1024));
    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: body,
      select: {
        id: true,
        rating: true,
        content: true,
        hasSpoiler: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok(updated);
  } catch (error) {
    return handleApiError(error, '리뷰 수정에 실패했습니다.');
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id, reviewId } = await params;
    await assertRateLimit({ key: `review:write:${user.id}`, limit: 20, windowMs: 15 * 60_000 });
    const review = await getReview(id, reviewId);
    if (user.id !== review.userId) {
      throw new ApiError(403, '리뷰 삭제 권한이 없습니다.');
    }

    await prisma.review.delete({
      where: { id: reviewId },
    });

    return message('리뷰가 삭제되었습니다.');
  } catch (error) {
    return handleApiError(error, '리뷰 삭제에 실패했습니다.');
  }
}
