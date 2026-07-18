import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, ok } from '@/lib/server/api';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = z.object({
      limit: z.coerce.number().int().min(1).max(50).optional().default(24),
    }).strict().parse(Object.fromEntries(searchParams.entries()));
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; novelCount: bigint }>>`
      SELECT t.id, t.name, COUNT(*)::bigint AS "novelCount"
      FROM tags t
      JOIN tags_on_novels ton ON ton."tagId" = t.id
      JOIN novels n ON n.id = ton."novelId"
      WHERE n."isPublished" = true AND n."approvalStatus" = 'APPROVED'::"ApprovalStatus"
      GROUP BY t.id, t.name
      ORDER BY COUNT(*) DESC, t.id DESC
      LIMIT ${limit}
    `;
    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      _count: { novels: Number(row.novelCount) },
    }));
    return ok(
      { items },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '인기 키워드를 불러오는 데 실패했습니다.');
  }
}
