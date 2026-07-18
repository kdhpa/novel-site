import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { authEmailSchema } from '@/lib/server/validation';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { createAuthToken, storeAuthToken } from '@/lib/server/auth-tokens';
import {
  buildEmailVerificationUrl,
  isAuthEmailConfigured,
  isCredentialsRegistrationEnabled,
  sendEmailVerification,
} from '@/lib/server/auth-email';
import { logServerError } from '@novelverse/shared';

const GENERIC_MESSAGE = '가입한 이메일이라면 인증 안내를 전송했습니다.';

export async function POST(request: NextRequest) {
  try {
    if (!isCredentialsRegistrationEnabled()) {
      throw new ApiError(503, '현재 이메일 인증 메일을 발송할 수 없습니다.');
    }

    const clientIp = getClientIp(request);
    await assertRateLimit({ key: `verify-resend:ip:${clientIp}`, limit: 10, windowMs: 60 * 60_000 });
    const body = authEmailSchema.parse(await readJsonBodyWithLimit<unknown>(request, 4 * 1024));
    await assertRateLimit({ key: `verify-resend:email:${body.email}`, limit: 5, windowMs: 60 * 60_000 });

    const user = await prisma.user.findUnique({
      where: { emailNormalized: body.email },
      select: { id: true, email: true, emailVerified: true, password: true, suspendedAt: true },
    });

    if (!user || user.emailVerified || !user.password || user.suspendedAt) {
      return ok(
        { message: GENERIC_MESSAGE },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const token = createAuthToken('emailVerification', user.email);
    await prisma.$transaction((transaction) => storeAuthToken(transaction, token));

    let verificationUrl: string | undefined;
    if (isAuthEmailConfigured()) {
      try {
        await sendEmailVerification(user.email, token.rawToken);
      } catch (error) {
        logServerError('auth.verification-resend', error, { userId: user.id });
      }
    } else if (process.env.NODE_ENV !== 'production') {
      verificationUrl = buildEmailVerificationUrl(user.email, token.rawToken);
    }

    return ok(
      { message: GENERIC_MESSAGE, ...(verificationUrl ? { verificationUrl } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '인증 이메일 재전송에 실패했습니다.');
  }
}
