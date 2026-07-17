import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { fail, handleApiError, ok } from '@/lib/server/api';
import { novelSchema } from '@/lib/server/validation';
import { resolveNovelSeasonId } from '@/lib/server/seasons';
import { replaceNovelTags } from '@/lib/server/novel-tags';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { NovelFormInput, NovelListItem } from '@/types';
import { Genre as GenreEnum, Status as StatusEnum, type Prisma } from '@novelverse/db/client';
import { z } from 'zod';
import { acquireUserContentLock } from '@novelverse/db';
import { assertBelowQuota, contentQuotas } from '@/lib/server/content-quotas';
import { normalizeTagKey } from '@novelverse/shared';

const validSorts = ['latest', 'updated', 'popular', 'likes', 'chapters'] as const;

const novelQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  genre: z.nativeEnum(GenreEnum).optional(),
  status: z.nativeEnum(StatusEnum).optional(),
  search: z.string().trim().max(100).optional(),
  authorId: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().min(1).max(20).optional(),
  sort: z.enum(validSorts).optional().default('latest'),
}).strict();

const novelSelect = {
  id: true,
  title: true,
  description: true,
  coverImage: true,
  genres: true,
  status: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, nickname: true, image: true } },
  _count: { select: { chapters: { where: { isPublished: true } }, likes: true } },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, genre, status, search, authorId, tag, sort } =
      novelQuerySchema.parse(Object.fromEntries(searchParams.entries()));

    const where: Prisma.NovelWhereInput = { isPublished: true, approvalStatus: 'APPROVED' };
    if (genre) where.genres = { has: genre };
    if (status) where.status = status;
    if (authorId) where.authorId = authorId;
    if (tag) {
      where.tags = {
        some: { tag: { normalizedName: normalizeTagKey(tag) } },
      };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { author: { nickname: { contains: search, mode: 'insensitive' } } },
        { tags: { some: { tag: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const orderBy: Prisma.NovelOrderByWithRelationInput | Prisma.NovelOrderByWithRelationInput[] =
      sort === 'updated'
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : sort === 'popular'
          ? [{ viewCount: 'desc' }, { id: 'desc' }]
          : sort === 'likes'
            ? [{ likeCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
          : sort === 'chapters'
            ? [{ chapters: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const [novels, total] = await Promise.all([
      prisma.novel.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy, select: novelSelect }),
      prisma.novel.count({ where }),
    ]);

    const items = novels as NovelListItem[];

    return ok(
      { items, total, page, limit, totalPages: Math.ceil(total / limit) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '작품 목록을 불러오는 데 실패했습니다.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail(401, '로그인이 필요합니다.');

    await assertRateLimit({
      key: `content:novel-write:${session.user.id}`,
      limit: 20,
      windowMs: 60 * 1000,
    });

    const body: NovelFormInput = novelSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 32 * 1024)
    );
    const tagNames = body.tags;
    const novel = await prisma.$transaction(async (transaction) => {
      await acquireUserContentLock(transaction, session.user.id);
      const [currentUser, novelCount] = await Promise.all([
        transaction.user.findUnique({ where: { id: session.user.id }, select: { id: true } }),
        transaction.novel.count({ where: { authorId: session.user.id } }),
      ]);
      if (!currentUser) return null;
      assertBelowQuota(novelCount, contentQuotas.novelsPerUser(), '작품은');

      const seasonId = await resolveNovelSeasonId(body.seasonId, { client: transaction });
      const createdNovel = await transaction.novel.create({
        data: {
          title: body.title.trim(),
          description: body.description?.trim() || null,
          genres: body.genres || [],
          status: body.status || 'ONGOING',
          coverImage: body.coverImage || null,
          isPublished: false,
          approvalStatus: 'DRAFT',
          authorId: session.user.id,
          seasonId: seasonId ?? null,
        },
        include: { author: { select: { id: true, nickname: true, image: true } } },
      });
      if (tagNames?.length) {
        await replaceNovelTags(transaction, createdNovel.id, tagNames, { clearExisting: false });
      }
      return createdNovel;
    });

    if (!novel) return fail(401, '계정을 찾을 수 없습니다. 다시 로그인해 주세요.');

    return ok(novel, { status: 201 });
  } catch (error) {
    return handleApiError(error, '작품 등록에 실패했습니다.');
  }
}
