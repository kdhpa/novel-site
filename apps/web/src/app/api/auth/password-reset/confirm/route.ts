import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { ApiError, handleApiError, message } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { passwordResetConfirmSchema } from '@/lib/server/validation';
import { authTokenIdentifier, consumeAuthToken } from '@/lib/server/auth-tokens';

export async function POST(request: NextRequest) {
  try {
    await assertRateLimit({
      key: `password-reset:confirm:ip:${getClientIp(request)}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });
    const body = passwordResetConfirmSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 4 * 1024),
    );
    await assertRateLimit({
      key: `password-reset:confirm:email:${body.email}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });

    const password = await hashPassword(body.password);
    const changedAt = new Date();

    await prisma.$transaction(async (transaction) => {
      const consumed = await consumeAuthToken(
        transaction,
        'passwordReset',
        body.email,
        body.token,
        changedAt,
      );
      if (!consumed) throw new ApiError(400, '재설정 링크가 올바르지 않거나 만료되었습니다.');

      const user = await transaction.user.findUnique({
        where: { emailNormalized: body.email },
        select: { id: true },
      });
      if (!user) throw new ApiError(400, '재설정 링크가 올바르지 않거나 만료되었습니다.');

      await transaction.user.update({
        where: { id: user.id },
        data: {
          email: body.email,
          password,
          passwordChangedAt: changedAt,
        },
        select: { id: true },
      });
      await Promise.all([
        transaction.session.deleteMany({ where: { userId: user.id } }),
        transaction.verificationToken.deleteMany({
          where: { identifier: authTokenIdentifier('passwordReset', body.email) },
        }),
      ]);
    });

    return message('비밀번호가 변경되었습니다. 다시 로그인해 주세요.', {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError(error, '비밀번호를 변경하지 못했습니다.');
  }
}
