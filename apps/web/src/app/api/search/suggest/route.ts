import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, ok } from '@/lib/server/api';
import type { Prisma } from '@novelverse/db/client';
import { z } from 'zod';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';

const publishedWhere = { isPublished: true, approvalStatus: 'APPROVED' } satisfies Prisma.NovelWhereInput;
const responseHeaders = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { q } = z.object({
      q: z.string().trim().max(100).optional().default(''),
    }).strict().parse(Object.fromEntries(searchParams.entries()));
    if (q.length < 2) return ok({ items: [] }, { headers: responseHeaders });

    await assertRateLimit({
      key: `search:suggest:${getClientIp(request)}`,
      limit: 120,
      windowMs: 60_000,
    });

    const [novels, authors, tags] = await Promise.all([
      prisma.novel.findMany({
        where: {
          ...publishedWhere,
          title: { contains: q, mode: 'insensitive' },
        },
        take: 5,
        orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
        select: { id: true, title: true },
      }),
      prisma.user.findMany({
        where: {
          nickname: { contains: q, mode: 'insensitive' },
          novels: { some: publishedWhere },
        },
        take: 3,
        orderBy: { id: 'desc' },
        select: { id: true, nickname: true },
      }),
      prisma.tag.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
          novels: { some: { novel: publishedWhere } },
        },
        take: 5,
        orderBy: [{ novels: { _count: 'desc' } }, { id: 'desc' }],
        select: { name: true },
      }),
    ]);

    return ok({
      items: [
        ...novels.map((novel) => ({ type: '작품', label: novel.title, href: `/novels/${novel.id}` })),
        ...authors.map((author) => ({ type: '작가', label: author.nickname || '익명 작가', href: `/authors/${author.id}` })),
        ...tags.map((tag) => ({ type: '키워드', label: `#${tag.name}`, href: `/novels?tag=${encodeURIComponent(tag.name)}` })),
      ],
    }, { headers: responseHeaders });
  } catch (error) {
    return handleApiError(error, '검색 제안을 불러오는 데 실패했습니다.');
  }
}
