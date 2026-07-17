// Characters API Route - List and Create
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/server/api';
import { isCurrentAdmin } from '@/lib/server/authz';
import { characterSchema } from '@/lib/server/validation';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse, CharacterFormInput, CharacterListItem } from '@/types';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import { z } from 'zod';
import { assertBelowQuota, contentQuotas } from '@/lib/server/content-quotas';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
}).strict();

// GET /api/novels/[id]/characters - List characters
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const query = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const sessionPromise = auth();

    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { authorId: true },
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
      session?.user?.id && !isAuthor && await isCurrentAdmin(session.user.id)
    );

    // Only author or admin can view characters
    if (!isAuthor && !isAdmin) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '캐릭터를 조회할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const [characters, total] = await Promise.all([
      prisma.character.findMany({
        where: { novelId: id },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          role: true,
          portraitUrl: true,
          appearance: true,
          createdAt: true,
        },
      }),
      prisma.character.count({ where: { novelId: id } }),
    ]);

    return NextResponse.json<ApiResponse<{
      items: CharacterListItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>>({
      success: true,
      data: {
        items: characters,
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return handleApiError(error, '캐릭터 목록을 불러오는 데 실패했습니다.');
  }
}

// POST /api/novels/[id]/characters - Create character
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
      key: `content:character-write:${session.user.id}`,
      limit: 30,
      windowMs: 60 * 1000,
    });

    const body: CharacterFormInput = characterSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 24 * 1024)
    );

    if (!body.name?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '캐릭터 이름을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!body.appearance?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '외형 설명을 입력해주세요.' },
        { status: 400 }
      );
    }

    const { character, resetReview } = await prisma.$transaction(async (transaction) => {
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
          select: { role: true },
        }),
      ]);
      if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
      const isAdmin = currentUser?.role === 'ADMIN';
      if (novel.authorId !== session.user.id && !isAdmin) {
        throw new ApiError(403, '작성 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(novel, { isAdmin });
      const characterCount = await transaction.character.count({ where: { novelId: id } });
      assertBelowQuota(characterCount, contentQuotas.charactersPerNovel(), '캐릭터는');
      const resetReview = shouldResetReviewAfterAuthorChange(novel, {
        id: session.user.id,
        role: isAdmin ? 'ADMIN' : null,
      });
      const created = await transaction.character.create({
        data: {
          novelId: id,
          name: body.name.trim(),
          description: body.description?.trim() || null,
          appearance: body.appearance.trim(),
          personality: body.personality?.trim() || null,
          role: body.role || null,
          portraitUrl: body.portraitUrl || null,
          portraitPrompt: body.portraitPrompt || null,
        },
      });
      if (resetReview) {
        await transaction.novel.update({ where: { id }, data: reviewResetData() });
      }
      return { character: created, resetReview };
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: character,
        message: resetReview
          ? '캐릭터가 등록되어 작품 심사 상태가 초기화되고 비공개되었습니다.'
          : '캐릭터가 등록되었습니다.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, '캐릭터 등록에 실패했습니다.');
  }
}
