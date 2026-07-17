import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { authEmailSchema } from '@/lib/server/validation';
import { createAuthToken, storeAuthToken } from '@/lib/server/auth-tokens';
import {
  buildPasswordResetUrl,
  isAuthEmailConfigured,
  isCredentialsRegistrationEnabled,
  sendPasswordReset,
} from '@/lib/server/auth-email';
import { logServerError } from '@novelverse/shared';

const GENERIC_MESSAGE = '해당 이메일로 사용할 수 있는 계정이 있다면 재설정 안내를 전송했습니다.';

export async function POST(request: NextRequest) {
  try {
    if (!isCredentialsRegistrationEnabled()) {
      throw new ApiError(503, '현재 비밀번호 재설정 이메일을 발송할 수 없습니다.');
    }

    const clientIp = getClientIp(request);
    await assertRateLimit({ key: `password-reset:request:ip:${clientIp}`, limit: 10, windowMs: 60 * 60_000 });
    const body = authEmailSchema.parse(await readJsonBodyWithLimit<unknown>(request, 4 * 1024));
    await assertRateLimit({ key: `password-reset:request:email:${body.email}`, limit: 5, windowMs: 60 * 60_000 });

    const user = await prisma.user.findUnique({
      where: { emailNormalized: body.email },
      select: { id: true, email: true, emailVerified: true, suspendedAt: true },
    });

    let resetUrl: string | undefined;
    if (user?.emailVerified && !user.suspendedAt) {
      const token = createAuthToken('passwordReset', user.email);
      await prisma.$transaction((transaction) => storeAuthToken(transaction, token));

      if (isAuthEmailConfigured()) {
        try {
          await sendPasswordReset(user.email, token.rawToken);
        } catch (error) {
          logServerError('auth.password-reset-email', error, { userId: user.id });
        }
      } else if (process.env.NODE_ENV !== 'production') {
        resetUrl = buildPasswordResetUrl(user.email, token.rawToken);
      }
    }

    return ok(
      { message: GENERIC_MESSAGE, ...(resetUrl ? { resetUrl } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '비밀번호 재설정 요청을 처리하지 못했습니다.');
  }
}
