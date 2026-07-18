import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { after } from 'next/server';
import { auth } from '@/lib/auth';
import { ApiError, fail, handleApiError, message, ok } from '@/lib/server/api';
import { isCurrentAdmin } from '@/lib/server/authz';
import { novelPatchSchema } from '@/lib/server/validation';
import { resolveNovelSeasonId } from '@/lib/server/seasons';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { replaceNovelTags } from '@/lib/server/novel-tags';
import { recordUniqueContentView } from '@/lib/server/content-view';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';
import type { NovelFormInput } from '@/types';
import { logServerError } from '@novelverse/shared';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { z } from 'zod';
import { cleanupStoredImageIfUnreferenced } from '@/lib/server/storage-cleanup';
import { findDeletedOwnedIllustrationPaths } from '@/lib/server/illustration-storage';
import { deleteFiles } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const novelDetailQuerySchema = z.object({
  chapterPage: z.coerce.number().int().min(1).max(10_000).default(1),
  chapterLimit: z.coerce.number().int().min(1).max(50).default(50),
}).strict();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const query = novelDetailQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const [session, novel] = await Promise.all([
      auth(),
      prisma.novel.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, nickname: true, image: true, bio: true } },
          chapters: {
            where: { isPublished: true },
            skip: (query.chapterPage - 1) * query.chapterLimit,
            take: query.chapterLimit,
            orderBy: [{ chapterNumber: 'asc' }, { id: 'asc' }],
            select: { id: true, chapterNumber: true, title: true, isPublished: true, publishedAt: true, createdAt: true, viewCount: true },
          },
          tags: { include: { tag: true } },
          _count: { select: { chapters: { where: { isPublished: true } }, bookmarks: true, likes: true, comments: { where: { isHidden: false } } } },
        },
      }),
    ]);

    if (!novel) return fail(404, '작품을 찾을 수 없습니다.');

    const isAuthor = session?.user?.id === novel.authorId;
    const isAdmin = Boolean(
      session?.user &&
      !isAuthor &&
      await isCurrentAdmin(session.user.id)
    );
    if ((!novel.isPublished || novel.approvalStatus !== 'APPROVED') && !isAuthor && !isAdmin) {
      return fail(404, '작품을 찾을 수 없습니다.');
    }

    if (novel.isPublished && novel.approvalStatus === 'APPROVED' && !isAuthor && !isAdmin) {
      after(async () => {
        try {
          await recordUniqueContentView({
            targetType: 'novel',
            targetId: id,
            userId: session?.user?.id,
            headers: request.headers,
          });
        } catch (error) {
          logServerError('content-view.novel-api', error, { novelId: id });
        }
      });
    }

    const chapterTotal = novel._count.chapters;
    return ok({
      ...novel,
      chapterPagination: {
        page: query.chapterPage,
        limit: query.chapterLimit,
        total: chapterTotal,
        totalPages: Math.max(1, Math.ceil(chapterTotal / query.chapterLimit)),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error, '작품을 불러오는 데 실패했습니다.');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id } = await params;
    if (!session?.user) return fail(401, '로그인이 필요합니다.');

    await assertRateLimit({
      key: `content:novel-write:${session.user.id}`,
      limit: 20,
      windowMs: 60 * 1000,
    });

    const body: Partial<NovelFormInput> = novelPatchSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 32 * 1024)
    );

    const { updatedNovel, previousCoverImage, authorId } = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);

      const [novel, currentUser] = await Promise.all([
        transaction.novel.findUnique({
          where: { id },
          select: {
            authorId: true,
            coverImage: true,
            seasonId: true,
            approvalStatus: true,
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
        throw new ApiError(403, '수정 권한이 없습니다.');
      }
      assertContestContentMutationAllowed(novel, {
        isAdmin,
        withdrawing: body.seasonId === null,
      });

      const seasonId = await resolveNovelSeasonId(body.seasonId, {
        currentSeasonId: novel.seasonId,
        client: transaction,
      });
      const resetReview = shouldResetReviewAfterAuthorChange(novel, {
        id: session.user.id,
        role: isAdmin ? 'ADMIN' : null,
      });
      const savedNovel = await transaction.novel.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.description !== undefined && {
            description: body.description?.trim() || null,
          }),
          ...(body.genres !== undefined && { genres: body.genres }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.coverImage !== undefined && { coverImage: body.coverImage || null }),
          ...(seasonId !== undefined && { seasonId }),
          ...(resetReview && reviewResetData()),
        },
        include: { author: { select: { id: true, nickname: true, image: true } } },
      });
      if (body.tags) await replaceNovelTags(transaction, id, body.tags);
      return {
        updatedNovel: savedNovel,
        previousCoverImage: novel.coverImage,
        authorId: novel.authorId,
      };
    });

    if (body.coverImage !== undefined && previousCoverImage !== updatedNovel.coverImage) {
      after(() => cleanupStoredImageIfUnreferenced({
        bucket: 'COVERS',
        source: previousCoverImage,
        ownerFolders: [id, authorId, `user-${authorId}`],
        scope: 'novel-cover.cleanup',
      }));
    }

    return ok(updatedNovel);
  } catch (error) {
    return handleApiError(error, '작품 수정에 실패했습니다.');
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id } = await params;
    if (!session?.user) return fail(401, '로그인이 필요합니다.');

    await assertRateLimit({
      key: `content:novel-write:${session.user.id}`,
      limit: 20,
      windowMs: 60 * 1000,
    });

    const deletedAssets = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await acquireNovelMutationLock(transaction, id);
      const [novel, currentUser] = await Promise.all([
        transaction.novel.findUnique({
          where: { id },
          select: {
            authorId: true,
            coverImage: true,
            chapters: { select: { id: true, content: true, aiImage: true } },
            characters: { select: { id: true, portraitUrl: true } },
          },
        }),
        transaction.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        }),
      ]);
      if (!novel) throw new ApiError(404, '작품을 찾을 수 없습니다.');
      if (novel.authorId !== session.user.id && currentUser?.role !== 'ADMIN') {
        throw new ApiError(403, '삭제 권한이 없습니다.');
      }
      await transaction.novel.delete({ where: { id } });
      return {
        authorId: novel.authorId,
        coverImage: novel.coverImage,
        chapters: novel.chapters,
        characters: novel.characters,
      };
    });

    after(async () => {
      const commonOwners = [id, deletedAssets.authorId, `user-${deletedAssets.authorId}`];
      const inlinePaths = deletedAssets.chapters.flatMap((chapter) =>
        findDeletedOwnedIllustrationPaths(chapter.content, '', {
          novelId: id,
          chapterId: chapter.id,
        })
      );
      if (inlinePaths.length) await deleteFiles('ILLUSTRATIONS', [...new Set(inlinePaths)]);

      await Promise.all([
        cleanupStoredImageIfUnreferenced({
          bucket: 'COVERS',
          source: deletedAssets.coverImage,
          ownerFolders: commonOwners,
          scope: 'novel-delete.cover-cleanup',
        }),
        ...deletedAssets.chapters.map((chapter) => cleanupStoredImageIfUnreferenced({
          bucket: 'ILLUSTRATIONS',
          source: chapter.aiImage,
          ownerFolders: [...commonOwners, chapter.id],
          scope: 'novel-delete.illustration-cleanup',
        })),
        ...deletedAssets.characters.map((character) => cleanupStoredImageIfUnreferenced({
          bucket: 'PORTRAITS',
          source: character.portraitUrl,
          ownerFolders: [...commonOwners, `${id}-${character.id}`],
          scope: 'novel-delete.portrait-cleanup',
        })),
      ]);
    });
    return message('작품이 삭제되었습니다.');
  } catch (error) {
    return handleApiError(error, '작품 삭제에 실패했습니다.');
  }
}
