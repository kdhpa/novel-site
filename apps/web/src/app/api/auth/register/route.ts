// User Registration API Route
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { fail, handleApiError } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { registerSchema } from '@/lib/server/validation';
import { createAuthToken, storeAuthToken } from '@/lib/server/auth-tokens';
import {
  buildEmailVerificationUrl,
  isAuthEmailConfigured,
  isCredentialsRegistrationEnabled,
  sendEmailVerification,
} from '@/lib/server/auth-email';
import { ApiError } from '@/lib/server/api';
import { logServerError } from '@novelverse/shared';
import { normalizeNicknameKey } from '@novelverse/shared';
import type { RegisterInput, ApiResponse, SafeUser } from '@/types';

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string } | null)?.code === 'P2002';
}

export async function GET() {
  return NextResponse.json(
    { success: true, data: { enabled: isCredentialsRegistrationEnabled() } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!isCredentialsRegistrationEnabled()) {
      throw new ApiError(503, '현재 이메일 회원가입을 사용할 수 없습니다. Google 로그인을 이용해 주세요.');
    }

    const clientIp = getClientIp(request);
    await assertRateLimit({
      key: `register:ip:${clientIp}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });

    const body: RegisterInput = registerSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 4 * 1024)
    );
    await assertRateLimit({
      key: `register:email:${body.email}`,
      limit: 5,
      windowMs: 60 * 60_000,
    });

    const [existingEmail, existingNickname] = await Promise.all([
      prisma.user.findUnique({
        where: { emailNormalized: body.email },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { nicknameNormalized: normalizeNicknameKey(body.nickname) },
        select: { id: true },
      }),
    ]);

    if (existingEmail) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미 사용 중인 이메일입니다.' },
        { status: 409 }
      );
    }

    if (existingNickname) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미 사용 중인 닉네임입니다.' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(body.password);

    const verificationToken = createAuthToken('emailVerification', body.email);
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email: body.email,
          emailNormalized: body.email,
          password: hashedPassword,
          nickname: body.nickname,
          nicknameNormalized: normalizeNicknameKey(body.nickname),
          name: body.name || body.nickname,
          role: 'USER',
          emailVerified: null,
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
      await storeAuthToken(transaction, verificationToken);
      return createdUser;
    });

    let verificationUrl: string | undefined;
    if (isAuthEmailConfigured()) {
      try {
        await sendEmailVerification(body.email, verificationToken.rawToken);
      } catch (error) {
        logServerError('auth.register-email', error, { userId: user.id });
        return fail(503, '계정은 생성되었지만 인증 이메일을 보내지 못했습니다. 잠시 후 재전송해 주세요.');
      }
    } else if (process.env.NODE_ENV !== 'production') {
      verificationUrl = buildEmailVerificationUrl(body.email, verificationToken.rawToken);
    }

    return NextResponse.json<ApiResponse<{ user: SafeUser; verificationUrl?: string }>>(
      {
        success: true,
        data: { user, ...(verificationUrl ? { verificationUrl } : {}) },
        message: '인증 이메일을 확인해 주세요.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return fail(409, '이미 사용 중인 이메일 또는 닉네임입니다.');
    }

    return handleApiError(error, '회원가입 중 오류가 발생했습니다.');
  }
}
