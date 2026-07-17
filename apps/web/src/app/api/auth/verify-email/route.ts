import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, message } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { emailVerificationSchema } from '@/lib/server/validation';
import { consumeAuthToken } from '@/lib/server/auth-tokens';

export async function POST(request: NextRequest) {
  try {
    await assertRateLimit({
      key: `verify-email:ip:${getClientIp(request)}`,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    const body = emailVerificationSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 4 * 1024),
    );

    await prisma.$transaction(async (transaction) => {
      const consumed = await consumeAuthToken(
        transaction,
        'emailVerification',
        body.email,
        body.token,
      );
      if (!consumed) throw new ApiError(400, '인증 링크가 올바르지 않거나 만료되었습니다.');

      const user = await transaction.user.findUnique({
        where: { emailNormalized: body.email },
        select: { id: true },
      });
      if (!user) throw new ApiError(400, '인증 링크가 올바르지 않거나 만료되었습니다.');

      await transaction.user.update({
        where: { id: user.id },
        data: { email: body.email, emailVerified: new Date() },
        select: { id: true },
      });
    });

    return message('이메일 인증이 완료되었습니다.', {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError(error, '이메일 인증에 실패했습니다.');
  }
}
