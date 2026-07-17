import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { fail, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { z } from 'zod';

const readingHistorySchema = z.object({
  novelId: z.string().trim().min(1).max(100),
  chapterNumber: z.number().int().positive(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    await assertRateLimit({
      key: `reading-history:write:${user.id}`,
      limit: 60,
      windowMs: 60_000,
    });
    const { novelId, chapterNumber } = readingHistorySchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 4 * 1024)
    );

    const chapter = await prisma.chapter.findFirst({
      where: {
        novelId,
        chapterNumber,
        isPublished: true,
        novel: { isPublished: true, approvalStatus: 'APPROVED' },
      },
      select: { id: true },
    });

    if (!chapter) return fail(404, '공개된 회차를 찾을 수 없습니다.');

    await prisma.readingHistory.upsert({
      where: { userId_novelId: { userId: user.id, novelId } },
      update: { lastChapter: chapterNumber },
      create: { userId: user.id, novelId, lastChapter: chapterNumber },
      select: { id: true },
    });

    return ok({ saved: true });
  } catch (error) {
    return handleApiError(error, '읽기 기록 저장에 실패했습니다.');
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    await assertRateLimit({
      key: `reading-history:read:${user.id}`,
      limit: 120,
      windowMs: 60_000,
    });
    const { searchParams } = new URL(request.url);
    const novelId = z.string().trim().min(1).max(100).parse(searchParams.get('novelId'));

    const readingHistory = await prisma.readingHistory.findUnique({
      where: { userId_novelId: { userId: user.id, novelId } },
      select: { lastChapter: true, updatedAt: true },
    });

    return ok(readingHistory);
  } catch (error) {
    return handleApiError(error, '읽기 기록을 불러오는 데 실패했습니다.');
  }
}
