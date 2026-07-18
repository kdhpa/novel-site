import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { reviewSchema } from '@/lib/server/validation';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';

type RouteParams = {
  params: Promise<{ id: string }>;
};

function parsePositiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get('page'), 1, 10_000);
    const limit = parsePositiveInteger(searchParams.get('limit'), 10, 50);

    const [novel, items, aggregate] = await Promise.all([
      prisma.novel.findFirst({
        where: { id, isPublished: true, approvalStatus: 'APPROVED' },
        select: { id: true },
      }),
      prisma.review.findMany({
        where: { novelId: id, isHidden: false },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          rating: true,
          content: true,
          hasSpoiler: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              nickname: true,
              image: true,
            },
          },
        },
      }),
      prisma.review.aggregate({
        where: { novelId: id, isHidden: false },
        _count: { _all: true },
        _avg: { rating: true },
      }),
    ]);
    if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
    const total = aggregate._count._all;

    return ok({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      averageRating: aggregate._avg.rating || 0,
    });
  } catch (error) {
    return handleApiError(error, '리뷰 목록을 불러오지 못했습니다.');
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertRateLimit({ key: `review:write:${user.id}`, limit: 20, windowMs: 15 * 60_000 });
    const body = reviewSchema.parse(await readJsonBodyWithLimit<unknown>(request, 8 * 1024));

    const novel = await prisma.novel.findFirst({
      where: {
        id,
        isPublished: true,
        approvalStatus: 'APPROVED',
      },
      select: { id: true },
    });

    if (!novel) {
      throw new ApiError(404, '리뷰를 작성할 수 있는 작품을 찾을 수 없습니다.');
    }

    const review = await prisma.review.upsert({
      where: {
        userId_novelId: {
          userId: user.id,
          novelId: id,
        },
      },
      create: {
        userId: user.id,
        novelId: id,
        rating: body.rating,
        content: body.content,
        hasSpoiler: body.hasSpoiler,
      },
      update: {
        rating: body.rating,
        content: body.content,
        hasSpoiler: body.hasSpoiler,
      },
      select: { id: true },
    });

    return ok(review, { status: 201 });
  } catch (error) {
    return handleApiError(error, '리뷰 저장에 실패했습니다.');
  }
}
