import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit } from '@/lib/server/rate-limit';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertRateLimit({ key: `like:write:${user.id}`, limit: 30, windowMs: 60_000 });

    const count = await prisma.$transaction(async (tx) => {
      const novel = await tx.novel.findFirst({
        where: {
          id,
          isPublished: true,
          approvalStatus: 'APPROVED',
        },
        select: { id: true },
      });
      if (!novel) {
        throw new ApiError(404, '작품을 찾을 수 없습니다.');
      }

      await tx.like.upsert({
        where: {
          userId_novelId: {
            userId: user.id,
            novelId: id,
          },
        },
        create: {
          userId: user.id,
          novelId: id,
        },
        update: {},
        select: { id: true },
      });
      const updatedNovel = await tx.novel.findUniqueOrThrow({
        where: { id },
        select: { likeCount: true },
      });
      return updatedNovel.likeCount;
    });

    return ok({ active: true, count });
  } catch (error) {
    return handleApiError(error, '좋아요 저장에 실패했습니다.');
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertRateLimit({ key: `like:write:${user.id}`, limit: 30, windowMs: 60_000 });

    const count = await prisma.$transaction(async (tx) => {
      await tx.like.deleteMany({
        where: {
          userId: user.id,
          novelId: id,
        },
      });
      const novel = await tx.novel.findUnique({
        where: { id },
        select: { likeCount: true },
      });
      return novel?.likeCount ?? 0;
    });

    return ok({ active: false, count });
  } catch (error) {
    return handleApiError(error, '좋아요 해제에 실패했습니다.');
  }
}
