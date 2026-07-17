import 'server-only';

import prisma from '@/lib/prisma';
import type { Prisma } from '@novelverse/db/client';
import type { LibraryItem, LibraryPageData, LibraryPagination, LibraryTab } from '@/components/library/types';

const publicNovelWhere = {
  isPublished: true,
  approvalStatus: 'APPROVED',
} satisfies Prisma.NovelWhereInput;

const novelSelect = {
  id: true,
  title: true,
  coverImage: true,
  genres: true,
  status: true,
  author: {
    select: {
      nickname: true,
    },
  },
  _count: {
    select: {
      chapters: { where: { isPublished: true } },
      likes: true,
    },
  },
} satisfies Prisma.NovelSelect;

function createPagination(page: number, limit: number, total: number): LibraryPagination {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

function createResult(tab: LibraryTab, items: LibraryItem[], page: number, limit: number, total: number): LibraryPageData {
  return { tab, items, pagination: createPagination(page, limit, total) };
}

export async function getLibraryData(
  userId: string,
  tab: LibraryTab,
  page: number,
  limit: number,
): Promise<LibraryPageData> {
  const skip = (page - 1) * limit;

  if (tab === 'history') {
    const where = { userId, novel: publicNovelWhere } satisfies Prisma.ReadingHistoryWhereInput;
    const [history, total] = await Promise.all([
      prisma.readingHistory.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          novelId: true,
          lastChapter: true,
          updatedAt: true,
          novel: { select: novelSelect },
        },
      }),
      prisma.readingHistory.count({ where }),
    ]);

    const chapterKeys = history.map((item) => ({ novelId: item.novelId, chapterNumber: item.lastChapter }));
    const chapters = chapterKeys.length
      ? await prisma.chapter.findMany({
          where: { OR: chapterKeys, isPublished: true },
          select: { id: true, novelId: true, chapterNumber: true },
        })
      : [];
    const chapterMap = new Map(chapters.map((chapter) => [`${chapter.novelId}:${chapter.chapterNumber}`, chapter.id]));
    const items = history.map<LibraryItem>((item) => ({
      id: item.id,
      novel: item.novel,
      lastChapter: item.lastChapter,
      continueChapterId: chapterMap.get(`${item.novelId}:${item.lastChapter}`) || null,
      updatedAt: item.updatedAt.toISOString(),
    }));

    return createResult(tab, items, page, limit, total);
  }

  if (tab === 'bookmarks') {
    const where = { userId, novel: publicNovelWhere } satisfies Prisma.BookmarkWhereInput;
    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: { id: true, createdAt: true, novel: { select: novelSelect } },
      }),
      prisma.bookmark.count({ where }),
    ]);
    const items = bookmarks.map<LibraryItem>((item) => ({
      id: item.id,
      novel: item.novel,
      createdAt: item.createdAt.toISOString(),
    }));
    return createResult(tab, items, page, limit, total);
  }

  if (tab === 'likes') {
    const where = { userId, novel: publicNovelWhere } satisfies Prisma.LikeWhereInput;
    const [likes, total] = await Promise.all([
      prisma.like.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: { id: true, createdAt: true, novel: { select: novelSelect } },
      }),
      prisma.like.count({ where }),
    ]);
    const items = likes.map<LibraryItem>((item) => ({
      id: item.id,
      novel: item.novel,
      createdAt: item.createdAt.toISOString(),
    }));
    return createResult(tab, items, page, limit, total);
  }

  const where = { userId, novel: publicNovelWhere } satisfies Prisma.ReviewWhereInput;
  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        rating: true,
        content: true,
        updatedAt: true,
        novel: { select: novelSelect },
      },
    }),
    prisma.review.count({ where }),
  ]);
  const items = reviews.map<LibraryItem>((item) => ({
    id: item.id,
    novel: item.novel,
    rating: item.rating,
    contentPreview: item.content.length > 240 ? `${item.content.slice(0, 239)}…` : item.content,
    updatedAt: item.updatedAt.toISOString(),
  }));
  return createResult(tab, items, page, limit, total);
}
