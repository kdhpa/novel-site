import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, message, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit } from '@/lib/server/rate-limit';

type RouteParams = {
  params: Promise<{ id: string }>;
};

async function assertPublicNovel(id: string) {
  const novel = await prisma.novel.findFirst({
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
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertRateLimit({ key: `bookmark:write:${user.id}`, limit: 30, windowMs: 60_000 });
    await assertPublicNovel(id);

    await prisma.bookmark.upsert({
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

    return ok({ active: true });
  } catch (error) {
    return handleApiError(error, '북마크 저장에 실패했습니다.');
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertRateLimit({ key: `bookmark:write:${user.id}`, limit: 30, windowMs: 60_000 });

    await prisma.bookmark.deleteMany({
      where: {
        userId: user.id,
        novelId: id,
      },
    });

    return message('북마크가 해제되었습니다.');
  } catch (error) {
    return handleApiError(error, '북마크 해제에 실패했습니다.');
  }
}
