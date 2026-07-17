import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { accountExportSchema } from '@/lib/server/validation';
import { consumeAuthToken } from '@/lib/server/auth-tokens';
import { acquireUserPrivacyLocks } from '@novelverse/db';

export function GET() {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'POST',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireUser();
    await Promise.all([
      assertRateLimit({
        key: `account-export:user:${sessionUser.id}`,
        limit: 3,
        windowMs: 24 * 60 * 60_000,
      }),
      assertRateLimit({
        key: `account-export:ip:${getClientIp(request)}`,
        limit: 10,
        windowMs: 24 * 60 * 60_000,
      }),
    ]);
    const body = accountExportSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 4 * 1024),
    );

    const user = await prisma.$transaction(async (transaction) => {
      await acquireUserPrivacyLocks(transaction, [sessionUser.id]);
      const currentUser = await transaction.user.findUnique({
        where: { id: sessionUser.id },
        select: {
          id: true,
          email: true,
          password: true,
          emailVerified: true,
          suspendedAt: true,
        },
      });
      if (!currentUser?.emailVerified || currentUser.suspendedAt) {
        throw new ApiError(403, '데이터 내보내기 권한을 다시 확인해 주세요.');
      }

      if (currentUser.password) {
        const passwordValid = body.password
          ? await bcrypt.compare(body.password, currentUser.password)
          : false;
        if (!passwordValid) throw new ApiError(403, '현재 비밀번호가 올바르지 않습니다.');
      }

      const tokenConsumed = await consumeAuthToken(
        transaction,
        'accountExport',
        currentUser.email,
        body.token,
      );
      if (!tokenConsumed) {
        throw new ApiError(403, '데이터 내보내기 확인 토큰이 올바르지 않거나 만료되었습니다.');
      }

      const exportedUser = await transaction.user.findUnique({
        where: { id: currentUser.id },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          name: true,
          nickname: true,
          image: true,
          bio: true,
          role: true,
          isVerifiedAuthor: true,
          verifiedAt: true,
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
          updatedAt: true,
          accounts: { select: { provider: true, providerAccountId: true, type: true } },
          novels: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              title: true,
              description: true,
              coverImage: true,
              genres: true,
              status: true,
              viewCount: true,
              likeCount: true,
              isPublished: true,
              approvalStatus: true,
              approvalNote: true,
              submittedAt: true,
              reviewedAt: true,
              authorId: true,
              seasonId: true,
              createdAt: true,
              updatedAt: true,
              chapters: {
                orderBy: [{ chapterNumber: 'asc' }, { id: 'asc' }],
                select: {
                  id: true,
                  chapterNumber: true,
                  title: true,
                  content: true,
                  aiImage: true,
                  aiImagePrompt: true,
                  viewCount: true,
                  isPublished: true,
                  publishedAt: true,
                  novelId: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
              characters: {
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                select: {
                  id: true,
                  name: true,
                  description: true,
                  appearance: true,
                  personality: true,
                  role: true,
                  portraitUrl: true,
                  portraitPrompt: true,
                  novelId: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
              tags: {
                select: { tag: { select: { name: true } } },
              },
            },
          },
          bookmarks: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, userId: true, novelId: true, createdAt: true },
          },
          likes: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, userId: true, novelId: true, createdAt: true },
          },
          reviews: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              rating: true,
              content: true,
              hasSpoiler: true,
              isHidden: true,
              moderationReason: true,
              moderatedAt: true,
              userId: true,
              novelId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          comments: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              content: true,
              isHidden: true,
              moderationReason: true,
              moderatedAt: true,
              userId: true,
              novelId: true,
              parentId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          readingHistory: {
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              lastChapter: true,
              userId: true,
              novelId: true,
              updatedAt: true,
            },
          },
          imageGenerationJobs: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              novelId: true,
              type: true,
              prompt: true,
              status: true,
              imageUrl: true,
              storageProvider: true,
              error: true,
              metadata: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          adminAuditLogs: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              action: true,
              targetType: true,
              createdAt: true,
            },
          },
          contentReports: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              targetType: true,
              targetId: true,
              reason: true,
              details: true,
              status: true,
              resolvedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });
      if (!exportedUser) throw new ApiError(404, '계정을 찾을 수 없습니다.');
      return exportedUser;
    });

    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), user }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="novelverse-data-${date}.json"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error, '데이터를 내보내지 못했습니다.');
  }
}
