// Character API Route - Get, Update, Delete
import { after, NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/server/api';
import { isCurrentAdmin } from '@/lib/server/authz';
import { characterSchema } from '@/lib/server/validation';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse, CharacterFormInput, Character } from '@/types';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import { cleanupStoredImageIfUnreferenced } from '@/lib/server/storage-cleanup';

interface RouteParams {
  params: Promise<{ id: string; characterId: string }>;
}

// GET /api/novels/[id]/characters/[characterId] - Get character details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, characterId } = await params;
    const sessionPromise = auth();

    const [novel, character] = await Promise.all([
      prisma.novel.findUnique({
        where: { id },
        select: { authorId: true },
      }),
      prisma.character.findFirst({ where: { id: characterId, novelId: id } }),
    ]);
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

    if (!isAuthor && !isAdmin) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '캐릭터를 조회할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    if (!character) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '캐릭터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<Character>>({
      success: true,
      data: character,
    });
  } catch (error) {
    return handleApiError(error, '캐릭터를 불러오는 데 실패했습니다.');
  }
}

// PUT /api/novels/[id]/characters/[characterId] - Update character
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id, characterId } = await params;

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

    const { character, resetReview, previousPortraitUrl, authorId } = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);
      const [novel, existingCharacter, currentUser] = await Promise.all([
        transaction.novel.findUnique({
          where: { id },
          select: {
            authorId: true,
            approvalStatus: true,
            seasonId: true,
            season: { select: { endsAt: true } },
          },
        }),
        transaction.character.findFirst({
          where: { id: characterId, novelId: id },
          select: { id: true, portraitUrl: true },
        }),
        transaction.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        }),
      ]);
      if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
      const isAdmin = currentUser?.role === 'ADMIN';
      if (novel.authorId !== session.user.id && !isAdmin) {
        throw new ApiError(403, '수정 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(novel, { isAdmin });
      if (!existingCharacter) throw new ApiError(404, '캐릭터를 찾을 수 없습니다.');
      const resetReview = shouldResetReviewAfterAuthorChange(novel, {
        id: session.user.id,
        role: isAdmin ? 'ADMIN' : null,
      });
      const updated = await transaction.character.update({
        where: { id: characterId },
        data: {
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
      return {
        character: updated,
        resetReview,
        previousPortraitUrl: existingCharacter.portraitUrl,
        authorId: novel.authorId,
      };
    });

    if (previousPortraitUrl !== character.portraitUrl) {
      after(() => cleanupStoredImageIfUnreferenced({
        bucket: 'PORTRAITS',
        source: previousPortraitUrl,
        ownerFolders: [id, `${id}-${characterId}`, authorId, `user-${authorId}`],
        scope: 'character-portrait.cleanup',
      }));
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: character,
        message: resetReview
          ? '캐릭터가 수정되어 작품 심사 상태가 초기화되고 비공개되었습니다.'
          : '캐릭터가 수정되었습니다.',
      }
    );
  } catch (error) {
    return handleApiError(error, '캐릭터 수정에 실패했습니다.');
  }
}

// DELETE /api/novels/[id]/characters/[characterId] - Delete character
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id, characterId } = await params;

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

    const deletedCharacter = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);
      const [novel, existingCharacter, currentUser] = await Promise.all([
        transaction.novel.findUnique({
          where: { id },
          select: {
            authorId: true,
            approvalStatus: true,
            seasonId: true,
            season: { select: { endsAt: true } },
          },
        }),
        transaction.character.findFirst({
          where: { id: characterId, novelId: id },
          select: { id: true, portraitUrl: true },
        }),
        transaction.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        }),
      ]);
      if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
      const isAdmin = currentUser?.role === 'ADMIN';
      if (novel.authorId !== session.user.id && !isAdmin) {
        throw new ApiError(403, '삭제 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(novel, { isAdmin });
      if (!existingCharacter) throw new ApiError(404, '캐릭터를 찾을 수 없습니다.');
      const resetReview = shouldResetReviewAfterAuthorChange(novel, {
        id: session.user.id,
        role: isAdmin ? 'ADMIN' : null,
      });
      await transaction.character.delete({ where: { id: characterId } });
      if (resetReview) {
        await transaction.novel.update({ where: { id }, data: reviewResetData() });
      }
      return {
        resetReview,
        portraitUrl: existingCharacter.portraitUrl,
        authorId: novel.authorId,
      };
    });

    after(() => cleanupStoredImageIfUnreferenced({
      bucket: 'PORTRAITS',
      source: deletedCharacter.portraitUrl,
      ownerFolders: [
        id,
        `${id}-${characterId}`,
        deletedCharacter.authorId,
        `user-${deletedCharacter.authorId}`,
      ],
      scope: 'character-delete.portrait-cleanup',
    }));

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        message: deletedCharacter.resetReview
          ? '캐릭터가 삭제되어 작품 심사 상태가 초기화되고 비공개되었습니다.'
          : '캐릭터가 삭제되었습니다.',
      }
    );
  } catch (error) {
    return handleApiError(error, '캐릭터 삭제에 실패했습니다.');
  }
}
