// Chapter Detail API Route - Get, Update, Delete
import { after, NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { deleteFiles } from '@/lib/supabase';
import { ApiError, handleApiError } from '@/lib/server/api';
import { isCurrentAdmin } from '@/lib/server/authz';
import { sanitizeHtmlContent, stripHtmlToText } from '@/lib/server/sanitize';
import { chapterPatchSchema } from '@/lib/server/validation';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { findDeletedOwnedIllustrationPaths } from '@/lib/server/illustration-storage';
import { recordUniqueContentView } from '@/lib/server/content-view';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse, ChapterFormInput } from '@/types';
import { logServerError } from '@novelverse/shared';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import { cleanupStoredImageIfUnreferenced } from '@/lib/server/storage-cleanup';

interface RouteParams {
  params: Promise<{ id: string; chapterId: string }>;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null &&
    (error as { code?: string }).code === 'P2002';
}

// GET /api/novels/[id]/chapters/[chapterId] - Get chapter details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, chapterId } = await params;
    const sessionPromise = auth();

    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        novelId: id,
      },
      include: {
        novel: {
          select: {
            id: true,
            title: true,
            genres: true,
            authorId: true,
            isPublished: true,
            approvalStatus: true,
            author: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
        },
      },
    });

    if (!chapter) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '회차를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const session = await sessionPromise;
    const isAuthor = session?.user?.id === chapter.novel.authorId;
    const isAdmin = Boolean(
      session?.user &&
      !isAuthor &&
      await isCurrentAdmin(session.user.id)
    );

    // Check access for unpublished chapters
    if (!chapter.isPublished || !chapter.novel.isPublished || chapter.novel.approvalStatus !== 'APPROVED') {
      if (!isAuthor && !isAdmin) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '회차를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
    }

    // Increment view count for public reader views only.
    if (chapter.isPublished && chapter.novel.isPublished && chapter.novel.approvalStatus === 'APPROVED' && !isAuthor && !isAdmin) {
      after(async () => {
        try {
          await recordUniqueContentView({
            targetType: 'chapter',
            targetId: chapterId,
            userId: session?.user?.id,
            headers: request.headers,
          });
        } catch (error) {
          logServerError('content-view.chapter-api', error, { chapterId });
        }
      });
    }

    // Get prev/next chapter IDs
    const [prevChapter, nextChapter] = await Promise.all([
      prisma.chapter.findFirst({
        where: {
          novelId: id,
          chapterNumber: { lt: chapter.chapterNumber },
          isPublished: true,
        },
        orderBy: { chapterNumber: 'desc' },
        select: { id: true },
      }),
      prisma.chapter.findFirst({
        where: {
          novelId: id,
          chapterNumber: { gt: chapter.chapterNumber },
          isPublished: true,
        },
        orderBy: { chapterNumber: 'asc' },
        select: { id: true },
      }),
    ]);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        ...chapter,
        prevChapterId: prevChapter?.id || null,
        nextChapterId: nextChapter?.id || null,
      },
    });
  } catch (error) {
    return handleApiError(error, '회차를 불러오지 못했습니다.');
  }
}

// PATCH /api/novels/[id]/chapters/[chapterId] - Update chapter
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id, chapterId } = await params;

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

    const body: Partial<ChapterFormInput> = chapterPatchSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 520 * 1024)
    );
    if (body.content !== undefined) {
      body.content = sanitizeHtmlContent(body.content);
      if (!stripHtmlToText(body.content)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '본문을 입력해 주세요.' },
          { status: 400 }
        );
      }
    }
    const { updatedChapter, resetReview, deletedIllustrationPaths, previousAiImage, authorId } =
      await prisma.$transaction(async (transaction) => {
        await acquireAdminRoleReadLock(transaction);
        await acquireNovelMutationLock(transaction, id);
        const [chapter, currentUser] = await Promise.all([
          transaction.chapter.findFirst({
            where: { id: chapterId, novelId: id },
            select: {
              id: true,
              content: true,
              aiImage: true,
              isPublished: true,
              novel: {
                select: {
                  authorId: true,
                  approvalStatus: true,
                  seasonId: true,
                  season: { select: { endsAt: true } },
                },
              },
            },
          }),
          transaction.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
          }),
        ]);
        if (!chapter) throw new ApiError(404, '회차를 찾을 수 없습니다.');
        const isAdmin = currentUser?.role === 'ADMIN';
        if (chapter.novel.authorId !== session.user.id && !isAdmin) {
          throw new ApiError(403, '수정 권한이 없습니다.');
        }
        assertContestContentMutationAllowed(chapter.novel, { isAdmin });

        const resetReview = shouldResetReviewAfterAuthorChange(chapter.novel, {
          id: session.user.id,
          role: isAdmin ? 'ADMIN' : null,
        });
        const isNewlyPublished = body.isPublished && !chapter.isPublished;
        const deletedIllustrationPaths = body.content !== undefined
          ? findDeletedOwnedIllustrationPaths(chapter.content, body.content, {
              novelId: id,
              chapterId,
            })
          : [];
        const updatedChapter = await transaction.chapter.update({
        where: { id: chapterId },
        data: {
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.content !== undefined && { content: body.content }),
          ...(body.chapterNumber !== undefined && { chapterNumber: body.chapterNumber }),
          ...(body.aiImage !== undefined && { aiImage: body.aiImage }),
          ...(body.aiImagePrompt !== undefined && { aiImagePrompt: body.aiImagePrompt }),
          ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
          ...(isNewlyPublished && { publishedAt: new Date() }),
          ...(body.isPublished === false && { publishedAt: null }),
        },
      });
        if (resetReview) {
          await transaction.novel.update({ where: { id }, data: reviewResetData() });
        }
        return {
          updatedChapter,
          resetReview,
          deletedIllustrationPaths,
          previousAiImage: chapter.aiImage,
          authorId: chapter.novel.authorId,
        };
      });

    // DB 저장 성공 후, 이전 본문에서 제거된 현재 작품 소유 파일만 정리한다.
    if (deletedIllustrationPaths.length > 0) {
      const deletionResult = await deleteFiles('ILLUSTRATIONS', deletedIllustrationPaths);
      if (!deletionResult.success) {
        logServerError(
          'chapter-illustration.cleanup',
          deletionResult.error || new Error('Illustration cleanup failed'),
          { chapterId }
        );
      }
    }

    if (body.aiImage !== undefined && previousAiImage !== updatedChapter.aiImage) {
      after(() => cleanupStoredImageIfUnreferenced({
        bucket: 'ILLUSTRATIONS',
        source: previousAiImage,
        ownerFolders: [id, chapterId, authorId, `user-${authorId}`],
        scope: 'chapter-ai-image.cleanup',
      }));
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updatedChapter,
      message: resetReview
        ? '회차가 수정되어 기존 심사 상태가 초기화되고 작품이 비공개되었습니다.'
        : '회차가 수정되었습니다.',
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '해당 회차 번호는 이미 존재합니다.' },
        { status: 409 }
      );
    }
    return handleApiError(error, '회차 수정에 실패했습니다.');
  }
}

// DELETE /api/novels/[id]/chapters/[chapterId] - Delete chapter
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id, chapterId } = await params;

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

    const deletedChapter = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);
      const [chapter, currentUser] = await Promise.all([
        transaction.chapter.findFirst({
          where: { id: chapterId, novelId: id },
          select: {
            id: true,
            content: true,
            aiImage: true,
            novel: {
              select: {
                authorId: true,
                approvalStatus: true,
                seasonId: true,
                season: { select: { endsAt: true } },
              },
            },
          },
        }),
        transaction.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        }),
      ]);
      if (!chapter) throw new ApiError(404, '회차를 찾을 수 없습니다.');
      const isAdmin = currentUser?.role === 'ADMIN';
      if (chapter.novel.authorId !== session.user.id && !isAdmin) {
        throw new ApiError(403, '삭제 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(chapter.novel, { isAdmin });
      const resetReview = shouldResetReviewAfterAuthorChange(chapter.novel, {
        id: session.user.id,
        role: isAdmin ? 'ADMIN' : null,
      });
      await transaction.chapter.delete({ where: { id: chapterId } });
      if (resetReview) {
        await transaction.novel.update({ where: { id }, data: reviewResetData() });
      }
      return {
        resetReview,
        content: chapter.content,
        aiImage: chapter.aiImage,
        authorId: chapter.novel.authorId,
      };
    });

    after(async () => {
      const inlinePaths = findDeletedOwnedIllustrationPaths(deletedChapter.content, '', {
        novelId: id,
        chapterId,
      });
      if (inlinePaths.length) {
        const result = await deleteFiles('ILLUSTRATIONS', inlinePaths);
        if (!result.success) {
          logServerError('chapter-delete.inline-cleanup', result.error || new Error('Cleanup failed'), {
            chapterId,
          });
        }
      }
      await cleanupStoredImageIfUnreferenced({
        bucket: 'ILLUSTRATIONS',
        source: deletedChapter.aiImage,
        ownerFolders: [id, chapterId, deletedChapter.authorId, `user-${deletedChapter.authorId}`],
        scope: 'chapter-delete.ai-image-cleanup',
      });
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      message: deletedChapter.resetReview
        ? '회차가 삭제되어 기존 심사 상태가 초기화되고 작품이 비공개되었습니다.'
        : '회차가 삭제되었습니다.',
    });
  } catch (error) {
    return handleApiError(error, '회차 삭제에 실패했습니다.');
  }
}
