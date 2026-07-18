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
    const { limit } = z.object({
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    }).strict().parse(Object.fromEntries(searchParams.entries()));
    const items = await prisma.novel.findMany({
      where: { isPublished: true, approvalStatus: 'APPROVED' },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: novelSelect,
    });
    return ok(
      { items },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '업데이트 작품을 불러오는 데 실패했습니다.');
  }
}
