import { prisma } from '@novelverse/db';
import { handleOpsApiError, ok, requireOpsAdmin } from '@/lib/api';
import { parseLimit, parsePage } from '@/lib/pagination';
import type { Prisma } from '@novelverse/db/client';
import type { Role } from '@novelverse/db/browser';

export async function GET(request: Request) {
  try {
    await requireOpsAdmin();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const role = searchParams.get('role');
    const page = parsePage(searchParams.get('page'));
    const limit = parseLimit(searchParams.get('limit'), 25, 100);

    const where: Prisma.UserWhereInput = {
      ...(q && {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { nickname: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      }),
      ...(role && ['USER', 'AUTHOR', 'ADMIN'].includes(role) && { role: role as Role }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          email: true,
          nickname: true,
          name: true,
          role: true,
          isVerifiedAuthor: true,
          canSkipReview: true,
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
          _count: { select: { novels: true, reviews: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return ok({ items: users, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return handleOpsApiError(error, '계정 목록을 불러오는 데 실패했습니다.');
  }
}
