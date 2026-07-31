// User API Route - Get and Update current user
import { after, NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { fail, handleApiError } from '@/lib/server/api';
import { assertRateLimit } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { userProfilePatchSchema } from '@/lib/server/validation';
import type { ApiResponse, SafeUser } from '@/types';
import { cleanupStoredImageIfUnreferenced } from '@/lib/server/storage-cleanup';
import { normalizeNicknameKey } from '@novelverse/shared';

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string } | null)?.code === 'P2002';
}

// GET /api/user - Get current user
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        image: true,
        bio: true,
        role: true,
        isVerifiedAuthor: true,
        canSkipReview: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            novels: true,
            bookmarks: true,
            likes: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: user,
    });
  } catch (error) {
    return handleApiError(error, '사용자 정보를 불러오는 데 실패했습니다.');
  }
}

// PATCH /api/user - Update current user
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    await assertRateLimit({
      key: `profile:update:${session.user.id}`,
      limit: 20,
      windowMs: 15 * 60_000,
    });

    const body = userProfilePatchSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 8 * 1024)
    );

    // Validate nickname if provided
    if (body.nickname !== undefined) {
      const existingNickname = await prisma.user.findFirst({
        where: {
          nicknameNormalized: normalizeNicknameKey(body.nickname),
          NOT: { id: session.user.id },
        },
        select: { id: true },
      });

      if (existingNickname) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '이미 사용 중인 닉네임입니다.' },
          { status: 409 }
        );
      }
    }

    const { updatedUser, previousImage } = await prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findUnique({
        where: { id: session.user.id },
        select: { image: true },
      });
      if (!current) return { updatedUser: null, previousImage: null };

      const updatedUser = await transaction.user.update({
        where: { id: session.user.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.nickname !== undefined && {
            nickname: body.nickname,
            nicknameNormalized: normalizeNicknameKey(body.nickname),
          }),
          ...(body.image !== undefined && { image: body.image }),
          ...(body.bio !== undefined && { bio: body.bio }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          nickname: true,
          image: true,
          bio: true,
          role: true,
          isVerifiedAuthor: true,
          canSkipReview: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return { updatedUser, previousImage: current.image };
    });

    if (!updatedUser) return fail(404, '사용자를 찾을 수 없습니다.');
    if (body.image !== undefined && previousImage !== updatedUser.image) {
      after(() => cleanupStoredImageIfUnreferenced({
        bucket: 'PROFILES',
        source: previousImage,
        ownerFolders: [session.user.id],
        scope: 'profile-image.cleanup',
      }));
    }

    return NextResponse.json<ApiResponse<SafeUser>>({
      success: true,
      data: updatedUser,
      message: '프로필이 업데이트되었습니다.',
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return fail(409, '이미 사용 중인 닉네임입니다.');
    }

    return handleApiError(error, '프로필 업데이트에 실패했습니다.');
  }
}
