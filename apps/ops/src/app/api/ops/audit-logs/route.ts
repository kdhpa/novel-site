import { prisma } from '@novelverse/db';
import { handleOpsApiError, ok, requireOpsAdmin } from '@/lib/api';
import { parseLimit, parsePage } from '@/lib/pagination';

export async function GET(request: Request) {
  try {
    await requireOpsAdmin();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get('page'));
    const limit = parseLimit(searchParams.get('limit'), 50, 100);
    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { admin: { select: { id: true, email: true, nickname: true } } },
      }),
      prisma.adminAuditLog.count(),
    ]);

    return ok({ items: logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return handleOpsApiError(error, '운영 로그를 불러오는 데 실패했습니다.');
  }
}
