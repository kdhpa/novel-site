import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/supabase';
import { requireNovelOwnerOrAdmin } from '@/lib/server/authz';
import { ApiError, handleApiError } from '@/lib/server/api';
import { reviewResetData, shouldResetReviewAfterAuthorChange } from '@/lib/server/novel-review';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { fetchVerifiedRemoteImage, RemoteImageError } from '@/lib/server/remote-image';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse } from '@/types';
import { z } from 'zod';
import { logServerError } from '@novelverse/shared';
import { acquireAdminRoleReadLock, acquireNovelMutationLock } from '@novelverse/db';
import { assertContestContentMutationAllowed } from '@/lib/server/contest-entry';

export const runtime = 'nodejs';

const targetBuckets = {
  cover: 'COVERS',
  illustration: 'ILLUSTRATIONS',
  portrait: 'PORTRAITS',
} as const;

const storeImageSchema = z
  .object({
    imageUrl: z.string().trim().min(1).max(2048),
    target: z.enum(['cover', 'illustration', 'portrait']).optional().default('cover'),
    novelId: z.string().trim().min(1).max(100).optional(),
    updateNovelCover: z.boolean().optional().default(false),
  })
  .strict()
  .refine((value) => !value.updateNovelCover || Boolean(value.novelId), {
    message: '작품 표지를 수정하려면 작품 정보가 필요합니다.',
  });

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<ApiResponse>({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    await assertRateLimit({
      key: `images:store:burst:${session.user.id}`,
      limit: 6,
      windowMs: 60 * 1000,
    });
    await assertRateLimit({
      key: `images:store:hour:${session.user.id}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });

    const body = storeImageSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 16 * 1024)
    );
    const { imageUrl, target } = body;

    if (body.novelId) {
      await requireNovelOwnerOrAdmin(body.novelId, session.user);
    }

    const image = await fetchVerifiedRemoteImage(imageUrl);
    const blob = new Blob([new Uint8Array(image.bytes)], { type: image.contentType });
    const folder = body.novelId || session.user.id || 'general';
    const filePath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${image.extension}`;
    const bucket = targetBuckets[target];
    const uploadResult = await uploadFile(bucket, filePath, blob, image.contentType);

    if (uploadResult.error || !uploadResult.url) {
      logServerError('image-store.storage', uploadResult.error || new Error('Storage returned no URL'), {
        userId: session.user.id,
        target,
      });
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미지 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    let updatedNovelCover = false;
    if (target === 'cover' && body.updateNovelCover && body.novelId) {
      await prisma.$transaction(async (transaction) => {
        await acquireAdminRoleReadLock(transaction);
        await acquireNovelMutationLock(transaction, body.novelId!);
        const [novel, currentUser] = await Promise.all([
          transaction.novel.findUnique({
            where: { id: body.novelId },
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

        if (!novel) {
          throw new ApiError(404, '작품을 찾을 수 없습니다.');
        }

        const isAdmin = currentUser?.role === 'ADMIN';
        if (novel.authorId !== session.user.id && !isAdmin) {
          throw new ApiError(403, '표지를 수정할 권한이 없습니다.');
        }
        assertContestContentMutationAllowed(novel, { isAdmin });

        const resetReview = shouldResetReviewAfterAuthorChange(novel, {
          id: session.user.id,
          role: currentUser?.role,
          canSkipReview: currentUser?.canSkipReview === true,
        });

        await transaction.novel.update({
          where: { id: body.novelId },
          data: {
            coverImage: uploadResult.url,
            ...(resetReview && reviewResetData()),
          },
        });
      });
      updatedNovelCover = true;
    }

    return NextResponse.json<
      ApiResponse<{ imageUrl: string; storageProvider: string; updatedNovelCover: boolean }>
    >({
      success: true,
      data: {
        imageUrl: uploadResult.url,
        storageProvider: uploadResult.storageProvider || 'supabase',
        updatedNovelCover,
      },
    });
  } catch (error) {
    if (error instanceof RemoteImageError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    return handleApiError(error, '이미지 저장에 실패했습니다.');
  }
}
