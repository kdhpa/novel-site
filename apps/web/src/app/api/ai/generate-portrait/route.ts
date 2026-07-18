import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleApiError } from '@/lib/server/api';
import {
  type CreateImageJobBody,
  createPersistentImageGenerationJob,
  prepareImageGenerationJob,
} from '@/lib/server/image-generation-jobs';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { aiImageSchema } from '@/lib/server/validation';
import type { ApiResponse } from '@/types';

export const runtime = 'nodejs';

/**
 * 기존 호출자를 위한 비동기 호환 경로다. 새 클라이언트는
 * /api/ai/image-jobs에 type=portrait를 전달한다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    await assertRateLimit({
      key: `ai:portrait:${session.user.id}:${getClientIp(request)}`,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });

    const raw = await readJsonBodyWithLimit<unknown>(request, 16 * 1024);
    const body = aiImageSchema.parse({
      ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}),
      type: 'portrait',
      clientRequestId:
        raw && typeof raw === 'object' && !Array.isArray(raw) &&
        typeof (raw as Record<string, unknown>).clientRequestId === 'string'
          ? (raw as Record<string, string>).clientRequestId
          : crypto.randomUUID(),
    }) as CreateImageJobBody;
    const prepared = await prepareImageGenerationJob(body, session.user);
    const job = await createPersistentImageGenerationJob(
      prepared,
      session.user.id,
      body.clientRequestId,
      getClientIp(request)
    );

    return NextResponse.json(
      { success: true, data: job } satisfies ApiResponse<typeof job>,
      { status: 202 }
    );
  } catch (error) {
    return handleApiError(error, '초상화 생성 작업을 시작하지 못했습니다.');
  }
}
