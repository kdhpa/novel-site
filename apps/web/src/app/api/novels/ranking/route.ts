import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, ok } from '@/lib/server/api';
import { z } from 'zod';

const novelSelect = {
  id: true,
  title: true,
  description: true,
  coverImage: true,
  genres: true,
  status: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, nickname: true, image: true } },
  _count: { select: { chapters: { where: { isPublished: true } }, likes: true } },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { metric, limit } = z.object({
      metric: z.enum(['combined', 'views', 'likes']).optional().default('combined'),
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    }).strict().parse(Object.fromEntries(searchParams.entries()));

    const rankedIds = metric === 'combined'
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT n.id
          FROM novels n
          WHERE n."isPublished" = true AND n."approvalStatus" = 'APPROVED'::"ApprovalStatus"
          ORDER BY (n."viewCount"::bigint + n."likeCount"::bigint * 10) DESC, n.id DESC
          LIMIT ${limit}
        `
      : null;
    const novels = await prisma.novel.findMany({
      where: {
        isPublished: true,
        approvalStatus: 'APPROVED',
        ...(rankedIds && { id: { in: rankedIds.map((row) => row.id) } }),
      },
      take: limit,
      orderBy: rankedIds
        ? { id: 'desc' }
        : metric === 'likes'
          ? [{ likeCount: 'desc' }, { id: 'desc' }]
          : [{ viewCount: 'desc' }, { id: 'desc' }],
      select: novelSelect,
    });
    const items = rankedIds
      ? rankedIds
          .map((row) => novels.find((novel) => novel.id === row.id))
          .filter((novel): novel is NonNullable<typeof novel> => Boolean(novel))
      : novels;

    return ok(
      { metric, items },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '랭킹을 불러오는 데 실패했습니다.');
  }
}
