import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiError, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { createAuthToken, storeAuthToken } from '@/lib/server/auth-tokens';
import {
  buildAccountExportUrl,
  isAuthEmailConfigured,
  isAuthEmailDeliveryEnabled,
  sendAccountExportConfirmation,
} from '@/lib/server/auth-email';
import { logServerError } from '@novelverse/shared';
import { acquireUserPrivacyLocks } from '@novelverse/db';

const GENERIC_MESSAGE = '계정의 검증된 이메일로 데이터 내보내기 확인 안내를 전송했습니다.';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireUser();
    if (!isAuthEmailDeliveryEnabled()) {
      throw new ApiError(503, '현재 데이터 내보내기 확인 이메일을 발송할 수 없습니다.');
    }

    await Promise.all([
      assertRateLimit({
        key: `account-export-request:user:${sessionUser.id}`,
        limit: 5,
        windowMs: 60 * 60_000,
      }),
      assertRateLimit({
        key: `account-export-request:ip:${getClientIp(request)}`,
        limit: 10,
        windowMs: 60 * 60_000,
      }),
    ]);

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, email: true, emailVerified: true, suspendedAt: true },
    });

    let exportUrl: string | undefined;
    if (user?.emailVerified && !user.suspendedAt) {
      const token = createAuthToken('accountExport', user.email);
      const stored = await prisma.$transaction(async (transaction) => {
        await acquireUserPrivacyLocks(transaction, [user.id]);
        const currentUser = await transaction.user.findUnique({
          where: { id: user.id },
          select: { email: true, emailVerified: true, suspendedAt: true },
        });
        if (!currentUser?.emailVerified || currentUser.suspendedAt) return false;
        await storeAuthToken(transaction, token);
        return true;
      });
      if (!stored) {
        return ok(
          { message: GENERIC_MESSAGE },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (isAuthEmailConfigured()) {
        try {
          await sendAccountExportConfirmation(user.email, token.rawToken);
        } catch (error) {
          await prisma.verificationToken.deleteMany({
            where: { identifier: token.identifier, token: token.tokenHash },
          });
          logServerError('account-export.confirmation-email', error, { userId: user.id });
          throw new ApiError(503, '데이터 내보내기 확인 이메일을 발송하지 못했습니다.');
        }
      } else if (process.env.NODE_ENV !== 'production') {
        exportUrl = buildAccountExportUrl(token.rawToken);
      }
    }

    return ok(
      { message: GENERIC_MESSAGE, ...(exportUrl ? { exportUrl } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '데이터 내보내기 확인 요청을 처리하지 못했습니다.');
  }
}
