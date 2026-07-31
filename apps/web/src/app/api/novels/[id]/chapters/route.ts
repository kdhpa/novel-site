// Chapters API Route - List and Create
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/server/api';
import { isCurrentAdmin } from '@/lib/server/authz';
import { sanitizeHtmlContent, stripHtmlToText } from '@/lib/server/sanitize';
import { chapterSchema } from '@/lib/server/validation';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse, ChapterFormInput, ChapterListItem } from '@/types';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import { z } from 'zod';
import { assertBelowQuota, contentQuotas } from '@/lib/server/content-quotas';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === 'P2002';
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
}).strict();

// GET /api/novels/[id]/chapters - List chapters
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const query = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const sessionPromise = auth();

    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { authorId: true, isPublished: true, approvalStatus: true },
    });
    const session = await sessionPromise;

    if (!novel) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const isAuthor = session?.user?.id === novel.authorId;
    const isAdmin = Boolean(
      session?.user?.role === 'ADMIN' &&
      !isAuthor &&
      await isCurrentAdmin(session.user.id)
    );
    if ((!novel.isPublished || novel.approvalStatus !== 'APPROVED') && !isAuthor && !isAdmin) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const where = {
      novelId: id,
      ...(!(isAuthor || isAdmin) && { isPublished: true }),
    };
    const [chapters, total] = await Promise.all([
      prisma.chapter.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ chapterNumber: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          viewCount: true,
        },
      }),
      prisma.chapter.count({ where }),
    ]);

    return NextResponse.json<ApiResponse<{
      items: ChapterListItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>>({
      success: true,
      data: {
        items: chapters,
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error, '회차 목록을 불러오지 못했습니다.');
  }
}

// POST /api/novels/[id]/chapters - Create chapter
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    await assertRateLimit({
      key: `content:chapter-write:${session.user.id}`,
      limit: 30,
      windowMs: 60 * 1000,
    });

    const body: ChapterFormInput = chapterSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 520 * 1024)
    );
    body.content = sanitizeHtmlContent(body.content);

    if (!body.title?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '제목을 입력해 주세요.' },
        { status: 400 }
      );
    }

    if (!stripHtmlToText(body.content)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '본문을 입력해 주세요.' },
        { status: 400 }
      );
    }

    const { chapter, resetReview } = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);
      const [novel, currentUser] = await Promise.all([
        transaction.novel.findUnique({
          where: { id },
          select: {
            authorId: true,
            approvalStatus: true,
            seasonId: true,
            season: { select: { endsAt: true } },
          },
        }),
        transaction.user.findUnique({
          where: { id: session.user.id },
          select: { role: true, canSkipReview: true },
        }),
      ]);
      if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
      const isAdmin = currentUser?.role === 'ADMIN';
      if (novel.authorId !== session.user.id && !isAdmin) {
        throw new ApiError(403, '작성 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(novel, { isAdmin });

      const chapterCount = await transaction.chapter.count({ where: { novelId: id } });
      assertBelowQuota(chapterCount, contentQuotas.chaptersPerNovel(), '회차는');

      let chapterNumber = body.chapterNumber;
      if (!chapterNumber) {
        const lastChapter = await transaction.chapter.findFirst({
          where: { novelId: id },
          orderBy: { chapterNumber: 'desc' },
          select: { chapterNumber: true },
        });
        chapterNumber = (lastChapter?.chapterNumber || 0) + 1;
      }

      const resetReview = shouldResetReviewAfterAuthorChange(novel, {
        id: session.user.id,
        role: currentUser?.role,
        canSkipReview: currentUser?.canSkipReview === true,
      });
      const chapter = await transaction.chapter.create({
        data: {
          novelId: id,
          chapterNumber,
          title: body.title.trim(),
          content: body.content,
          aiImage: body.aiImage,
          aiImagePrompt: body.aiImagePrompt,
          isPublished: body.isPublished || false,
          publishedAt: body.isPublished ? new Date() : null,
        },
      });
      if (resetReview) {
        await transaction.novel.update({
          where: { id },
          data: reviewResetData(),
        });
      }
      return { chapter, resetReview };
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: chapter,
        message: resetReview
          ? '회차가 등록되어 기존 심사 상태가 초기화되고 작품이 비공개되었습니다.'
          : '회차가 등록되었습니다.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '해당 회차 번호는 이미 존재합니다.' },
        { status: 400 }
      );
    }

    return handleApiError(error, '회차 등록에 실패했습니다.');
  }
}
