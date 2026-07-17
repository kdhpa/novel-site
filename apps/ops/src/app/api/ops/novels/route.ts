import { prisma } from '@novelverse/db';
import { handleOpsApiError, ok, requireOpsAdmin } from '@/lib/api';
import { parseLimit, parsePage } from '@/lib/pagination';
import type { Prisma } from '@novelverse/db/client';
import type { ApprovalStatus } from '@novelverse/db/browser';

export async function GET(request: Request) {
  try {
    await requireOpsAdmin();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const status = searchParams.get('status');
    const page = parsePage(searchParams.get('page'));
    const limit = parseLimit(searchParams.get('limit'), 25, 100);

    const where: Prisma.NovelWhereInput = {
      ...(q && {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { author: { email: { contains: q, mode: 'insensitive' } } },
          { author: { nickname: { contains: q, mode: 'insensitive' } } },
        ],
      }),
      ...(status && ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(status) && { approvalStatus: status as ApprovalStatus }),
    };

    const [novels, total] = await Promise.all([
      prisma.novel.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          approvalStatus: true,
          isPublished: true,
          updatedAt: true,
          author: { select: { id: true, email: true, nickname: true } },
          _count: { select: { chapters: true, likes: true } },
        },
      }),
      prisma.novel.count({ where }),
    ]);

    return ok({ items: novels, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return handleOpsApiError(error, '작품 목록을 불러오는 데 실패했습니다.');
  }
}
