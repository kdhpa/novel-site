import { prisma } from '@novelverse/db';
import { handleOpsApiError, ok, requireOpsAdmin } from '@/lib/api';
import { parseLimit, parsePage } from '@/lib/pagination';

export async function GET(request: Request) {
  try {
    await requireOpsAdmin();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get('page'));
    const limit = parseLimit(searchParams.get('limit'), 20, 50);
    const where = { approvalStatus: 'PENDING_REVIEW' as const };
    const [novels, total] = await Promise.all([
      prisma.novel.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          genres: true,
          submittedAt: true,
          author: { select: { id: true, nickname: true, email: true, image: true } },
          _count: { select: { chapters: true } },
        },
      }),
      prisma.novel.count({ where }),
    ]);

    return ok({ items: novels, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return handleOpsApiError(error, '심사 목록을 불러오는 데 실패했습니다.');
  }
}
