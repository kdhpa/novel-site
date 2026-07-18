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
 * 이전 URL을 호출하는 클라이언트도 동기 대기 대신 영속 작업을 받는다.
 * 새 코드는 /api/ai/image-jobs를 직접 사용한다.
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
      key: `ai:image:${session.user.id}:${getClientIp(request)}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });

    const raw = await readJsonBodyWithLimit<unknown>(request, 32 * 1024);
    const record = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const body = aiImageSchema.parse({
      ...record,
      clientRequestId: typeof record.clientRequestId === 'string'
        ? record.clientRequestId
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
    return handleApiError(error, '이미지 생성 작업을 시작하지 못했습니다.');
  }
}
